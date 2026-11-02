import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  CreateSaleRequest,
  EVENTS,
  EventBus,
  ListSalesRequest,
  PaymentMethod,
  ProductCategory,
  RefundSaleRequest,
  SaleDto,
  SaleStatus,
  SalesPage,
  StockLowEvent,
  StockMovementType,
} from '@app/common';
import { Sale } from './sale.entity';
import { Counter } from './counter.entity';
import { computeSaleTotals, formatSaleNumber, mergeSaleItems } from './sale.totals';
import { Product } from '../products/product.entity';
import { applyStockChange } from '../products/stock.ledger';
import { ProductsService } from '../products/products.service';
import { toSaleDto } from '../mappers';
import { clampInt, parseFrom, parseToExclusive } from '../shared/periods';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly dataSource: DataSource,
    private readonly products: ProductsService,
    private readonly events: EventBus,
  ) {}

  async create(request: CreateSaleRequest): Promise<SaleDto> {
    if (!Object.values(PaymentMethod).includes(request.paymentMethod)) {
      throw new BadRequestException('Moyen de paiement invalide.');
    }
    const requested = mergeSaleItems(request.items);

    const { sale, lowEvents } = await this.dataSource.transaction(async (manager) => {
      // Lock every product in a stable order so concurrent sales cannot deadlock.
      const locked = await manager.find(Product, {
        where: { id: In(requested.map((item) => item.productId)) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const byId = new Map(locked.map((product) => [product.id, product]));
      const lines = requested.map((item) => {
        const product = byId.get(item.productId);
        if (!product) throw new NotFoundException('Produit introuvable.');
        if (!product.isActive) throw new BadRequestException(`Produit indisponible : ${product.name}.`);
        // Services have no goods cost unless one is set; products without cost stay null (flagged in KPIs).
        const unitCost = product.cost ?? (product.category === ProductCategory.SERVICE ? 0 : null);
        return { ...item, name: product.name, unitPrice: product.price, unitCost };
      });
      const totals = computeSaleTotals(lines, Number(request.discount ?? 0));

      const now = new Date();
      const sequence = await nextCounter(manager, `sale-${now.getFullYear()}`);
      const sale = await manager.save(
        manager.create(Sale, {
          number: formatSaleNumber(now.getFullYear(), sequence),
          memberId: request.memberId ?? null,
          memberName: request.memberName?.trim() || null,
          memberEmail: request.memberEmail?.trim() || null,
          items: totals.items,
          subtotal: totals.subtotal,
          discount: totals.discount,
          total: totals.total,
          paymentMethod: request.paymentMethod,
          status: SaleStatus.COMPLETED,
          soldById: request.actor?.id ?? null,
          soldByName: request.actor?.name ?? null,
        }),
      );

      const lowEvents: StockLowEvent[] = [];
      for (const item of requested) {
        const product = byId.get(item.productId)!;
        if (product.stock === null) continue; // services are not stocked
        const { lowEvent } = await applyStockChange(manager, product, StockMovementType.SALE, item.quantity, {
          reason: `Vente ${sale.number}`,
          createdByName: request.actor?.name ?? null,
        });
        if (lowEvent) lowEvents.push(lowEvent);
      }
      return { sale, lowEvents };
    });

    this.events.publish(EVENTS.saleCompleted, {
      saleId: sale.id,
      number: sale.number,
      memberId: sale.memberId,
      memberName: sale.memberName,
      email: sale.memberEmail,
      items: sale.items.map(({ name, quantity, unitPrice, total }) => ({ name, quantity, unitPrice, total })),
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      createdAt: sale.createdAt.toISOString(),
    });
    this.products.publishLowStock(lowEvents);
    return toSaleDto(sale);
  }

  async list(request: ListSalesRequest): Promise<SalesPage> {
    const page = clampInt(request.page, 1, 1, 100_000);
    const pageSize = clampInt(request.pageSize, 20, 1, 100);
    const query = this.sales.createQueryBuilder('s');
    const from = parseFrom(request.from);
    const to = parseToExclusive(request.to);
    if (from) query.andWhere('s.createdAt >= :from', { from });
    if (to) query.andWhere('s.createdAt < :to', { to });
    if (request.memberId) query.andWhere('s.memberId = :memberId', { memberId: request.memberId });

    const [rows, total] = await query
      .clone()
      .orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    const raw = await query
      .clone()
      .select('COALESCE(SUM(s.total), 0)', 'sum')
      .andWhere('s.status = :status', { status: SaleStatus.COMPLETED })
      .getRawOne<{ sum: string }>();

    return { items: rows.map(toSaleDto), total, page, pageSize, sum: Number(raw?.sum ?? 0) };
  }

  /** Marks the sale refunded and puts the stocked items back (once). */
  async refund(request: RefundSaleRequest): Promise<SaleDto> {
    const sale = await this.dataSource.transaction(async (manager) => {
      const sale = await manager.findOne(Sale, { where: { id: request.id }, lock: { mode: 'pessimistic_write' } });
      if (!sale) throw new NotFoundException('Vente introuvable.');
      if (sale.status === SaleStatus.REFUNDED) throw new ConflictException('Cette vente est déjà remboursée.');

      const ids = [...new Set(sale.items.map((item) => item.productId))];
      const locked = ids.length
        ? await manager.find(Product, { where: { id: In(ids) }, order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } })
        : [];
      const byId = new Map(locked.map((product) => [product.id, product]));
      for (const item of sale.items) {
        const product = byId.get(item.productId);
        if (!product || product.stock === null) continue;
        await applyStockChange(manager, product, StockMovementType.RETURN, item.quantity, {
          reason: `Remboursement ${sale.number}`,
          createdByName: request.actor?.name ?? null,
        });
      }

      sale.status = SaleStatus.REFUNDED;
      sale.refundedAt = new Date();
      sale.refundedByName = request.actor?.name ?? null;
      return manager.save(sale);
    });
    return toSaleDto(sale);
  }
}

/** Atomically increments and returns a named counter (safe under concurrency). */
async function nextCounter(manager: EntityManager, key: string): Promise<number> {
  const rows: { value: number }[] = await manager.query(
    `INSERT INTO "counters" ("key", "value") VALUES ($1, 1)
     ON CONFLICT ("key") DO UPDATE SET "value" = "counters"."value" + 1
     RETURNING "value"`,
    [key],
  );
  return Number(rows[0].value);
}
