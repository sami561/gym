import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  CreateProductRequest,
  CreateStockMovementRequest,
  EVENTS,
  EventBus,
  IdRequest,
  ListProductsRequest,
  ListStockMovementsRequest,
  OkResult,
  ProductCategory,
  ProductDto,
  StockLowEvent,
  StockMovementDto,
  StockMovementType,
  UpdateProductRequest,
} from '@app/common';
import { Product } from './product.entity';
import { StockMovement } from './stock-movement.entity';
import { applyStockChange } from './stock.ledger';
import { toMovementDto, toProductDto } from '../mappers';
import { GYM_TIMEZONE, clampInt, likePattern } from '../shared/periods';
import { round3 } from '../shared/money';

const MANUAL_MOVEMENTS = [StockMovementType.IN, StockMovementType.OUT, StockMovementType.ADJUSTMENT];
const LOW_STOCK_REMINDER_MS = 7 * 86_400_000;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(StockMovement) private readonly movements: Repository<StockMovement>,
    private readonly dataSource: DataSource,
    private readonly events: EventBus,
  ) {}

  async list(request: ListProductsRequest): Promise<ProductDto[]> {
    const query = this.products.createQueryBuilder('p');
    if (!request.includeInactive) query.andWhere('p.isActive = true');
    if (request.category) query.andWhere('p.category = :category', { category: request.category });
    if (request.search?.trim()) {
      query.andWhere('(p.name ILIKE :search OR p.sku ILIKE :search)', { search: likePattern(request.search) });
    }
    if (request.lowStockOnly) query.andWhere('p.stock IS NOT NULL AND p.stock <= p.lowStockThreshold');
    const rows = await query.orderBy('p.name', 'ASC').getMany();
    return rows.map(toProductDto);
  }

  async create(request: CreateProductRequest): Promise<ProductDto> {
    const name = requireName(request.name);
    const sku = normaliseSku(request.sku);
    await this.assertSkuFree(sku);
    const tracked = request.category !== ProductCategory.SERVICE;
    const initialStock = request.stock ?? 0;
    if (tracked && (!Number.isInteger(initialStock) || initialStock < 0)) {
      throw new BadRequestException('Le stock initial doit être un entier positif.');
    }

    const product = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(Product, {
          name,
          sku,
          category: request.category,
          price: requireAmount(request.price, 'Le prix'),
          cost: optionalAmount(request.cost, 'Le coût'),
          stock: tracked ? 0 : null,
          lowStockThreshold: requireThreshold(request.lowStockThreshold ?? (tracked ? 5 : 0)),
          isActive: request.isActive ?? true,
          imageUrl: request.imageUrl?.trim() || null,
        }),
      );
      if (tracked && initialStock > 0) {
        await applyStockChange(manager, created, StockMovementType.IN, initialStock, {
          unitCost: created.cost,
          reason: 'Stock initial',
        });
      }
      return created;
    });
    return toProductDto(product);
  }

  async update({ id, data }: UpdateProductRequest): Promise<ProductDto> {
    const product = await this.findOrFail(id);
    if (data.name !== undefined) product.name = requireName(data.name);
    if (data.sku !== undefined) {
      const sku = normaliseSku(data.sku);
      if (sku !== product.sku) await this.assertSkuFree(sku, product.id);
      product.sku = sku;
    }
    if (data.category !== undefined && data.category !== product.category) {
      // Switching to/from SERVICE turns stock tracking off/on.
      if (data.category === ProductCategory.SERVICE) product.stock = null;
      else if (product.category === ProductCategory.SERVICE) product.stock = 0;
      product.category = data.category;
    }
    if (data.price !== undefined) product.price = requireAmount(data.price, 'Le prix');
    if (data.cost !== undefined) product.cost = optionalAmount(data.cost, 'Le coût');
    if (data.lowStockThreshold !== undefined) product.lowStockThreshold = requireThreshold(data.lowStockThreshold);
    if (data.isActive !== undefined) product.isActive = data.isActive;
    if (data.imageUrl !== undefined) product.imageUrl = data.imageUrl?.trim() || null;
    if (product.stock === null || product.stock > product.lowStockThreshold) product.lowStockAlertedAt = null;
    return toProductDto(await this.products.save(product));
  }

  /** Products with history are deactivated rather than deleted. */
  async remove({ id }: IdRequest): Promise<OkResult> {
    const product = await this.findOrFail(id);
    const hasHistory = await this.movements.exists({ where: { productId: id } });
    if (hasHistory) {
      await this.products.update({ id }, { isActive: false });
    } else {
      await this.products.delete({ id });
    }
    return { ok: true };
  }

  async move(request: CreateStockMovementRequest): Promise<StockMovementDto> {
    if (!MANUAL_MOVEMENTS.includes(request.type)) {
      throw new BadRequestException('Type de mouvement invalide (IN, OUT ou ADJUSTMENT).');
    }
    const { movement, lowEvent } = await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOne(Product, { where: { id: request.productId }, lock: { mode: 'pessimistic_write' } });
      if (!product) throw new NotFoundException('Produit introuvable.');
      return applyStockChange(manager, product, request.type, Number(request.quantity), {
        unitCost: optionalAmount(request.unitCost, 'Le coût unitaire'),
        reason: request.reason?.trim() || null,
        createdByName: request.actor?.name ?? null,
      });
    });
    this.publishLowStock(lowEvent ? [lowEvent] : []);
    return toMovementDto(movement);
  }

  async listMovements(request: ListStockMovementsRequest): Promise<StockMovementDto[]> {
    const rows = await this.movements.find({
      where: request.productId ? { productId: request.productId } : {},
      relations: { product: true },
      order: { createdAt: 'DESC' },
      take: clampInt(request.limit, 50, 1, 200),
    });
    return rows.map((row) => toMovementDto(row));
  }

  publishLowStock(events: StockLowEvent[]): void {
    for (const event of events) this.events.publish(EVENTS.stockLow, event);
  }

  /** Daily reminder for products still under their threshold (at most once a week each). */
  @Cron('0 8 * * *', { name: 'low-stock-reminder', timeZone: GYM_TIMEZONE })
  async remindLowStock(): Promise<void> {
    const remindBefore = new Date(Date.now() - LOW_STOCK_REMINDER_MS);
    const rows = await this.products
      .createQueryBuilder('p')
      .where('p.isActive = true')
      .andWhere('p.stock IS NOT NULL AND p.stock <= p.lowStockThreshold')
      .andWhere('(p.lowStockAlertedAt IS NULL OR p.lowStockAlertedAt < :remindBefore)', { remindBefore })
      .getMany();
    for (const product of rows) {
      this.events.publish(EVENTS.stockLow, {
        productId: product.id,
        name: product.name,
        stock: product.stock ?? 0,
        threshold: product.lowStockThreshold,
      });
      await this.products.update({ id: product.id }, { lowStockAlertedAt: new Date() });
    }
    if (rows.length) this.logger.log(`Low-stock reminder sent for ${rows.length} product(s)`);
  }

  private async findOrFail(id: string): Promise<Product> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Produit introuvable.');
    return product;
  }

  private async assertSkuFree(sku: string | null, exceptId?: string): Promise<void> {
    if (!sku) return;
    const existing = await this.products
      .createQueryBuilder('p')
      .where('LOWER(p.sku) = LOWER(:sku)', { sku })
      .getOne();
    if (existing && existing.id !== exceptId) throw new ConflictException(`Le SKU ${sku} est déjà utilisé.`);
  }
}

function requireName(value: string | undefined): string {
  const name = value?.trim();
  if (!name) throw new BadRequestException('Le nom du produit est obligatoire.');
  return name;
}

function normaliseSku(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function requireAmount(value: number | undefined, label: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException(`${label} doit être un montant positif.`);
  return round3(amount);
}

function optionalAmount(value: number | null | undefined, label: string): number | null {
  return value === null || value === undefined ? null : requireAmount(value, label);
}

function requireThreshold(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException("Le seuil d'alerte doit être un entier positif.");
  }
  return value;
}
