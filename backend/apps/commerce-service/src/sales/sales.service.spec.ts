import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  EVENTS,
  EventBus,
  PaymentMethod,
  ProductCategory,
  Role,
  SaleStatus,
  StockMovementType,
} from '@app/common';
import { Product } from '../products/product.entity';
import { ProductsService } from '../products/products.service';
import { StockMovement } from '../products/stock-movement.entity';
import { Sale } from './sale.entity';
import { SalesService } from './sales.service';

const NOW = new Date('2026-11-02T09:15:00.000Z');
const actor = { id: 'u-staff', role: Role.STAFF, name: 'Sami' };

function product(overrides: Partial<Product>): Product {
  return Object.assign(new Product(), {
    sku: null,
    category: ProductCategory.SUPPLEMENT,
    cost: null,
    stock: 10,
    lowStockThreshold: 5,
    isActive: true,
    imageUrl: null,
    lowStockAlertedAt: null,
    ...overrides,
  });
}

/** Transaction double over an in-memory catalogue; records what the sale wrote. */
function setup(catalogue: Product[], storedSale?: Sale) {
  const movements: StockMovement[] = [];
  const manager = {
    find: jest.fn(async () => catalogue),
    findOne: jest.fn(async () => storedSale ?? null),
    query: jest.fn(async () => [{ value: 123 }]),
    update: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((entity: new () => object, data: object) => Object.assign(new entity(), data)),
    save: jest.fn(async (row: object) => {
      if (row instanceof StockMovement) movements.push(row);
      if (row instanceof Sale && !row.id) Object.assign(row, { id: 'sale-1', createdAt: NOW });
      return row;
    }),
  };
  const dataSource = { transaction: jest.fn(async (work: (m: EntityManager) => unknown) => work(manager as unknown as EntityManager)) };
  const products = { publishLowStock: jest.fn() };
  const events = { publish: jest.fn() };
  const service = new SalesService(
    {} as Repository<Sale>,
    dataSource as unknown as DataSource,
    products as unknown as ProductsService,
    events as unknown as EventBus,
  );
  return { service, manager, dataSource, products, events, movements };
}

describe('SalesService (POS)', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    const whey = () => product({ id: 'p-whey', name: 'Whey 1 kg', price: 89.9, cost: 60, stock: 6 });
    const water = () => product({ id: 'p-water', name: 'Eau 1,5 L', category: ProductCategory.DRINK, price: 1.2, cost: null, stock: 40 });
    const coaching = () =>
      product({ id: 'p-pt', name: 'Séance coaching', category: ProductCategory.SERVICE, price: 30, cost: null, stock: null });

    it('refuses an unknown payment method before opening a transaction', async () => {
      const { service, dataSource } = setup([]);
      await expect(
        service.create({ items: [{ productId: 'p-whey', quantity: 1 }], paymentMethod: 'CHEQUE' as PaymentMethod }),
      ).rejects.toThrow(new BadRequestException('Moyen de paiement invalide.'));
      await expect(service.create({ items: [], paymentMethod: PaymentMethod.CASH })).rejects.toThrow(
        'Ajoutez au moins un article à la vente.',
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses unknown and inactive products', async () => {
      const { service } = setup([product({ id: 'p-old', name: 'Gourde 2019', price: 15, isActive: false })]);
      await expect(service.create({ items: [{ productId: 'p-gone', quantity: 1 }], paymentMethod: PaymentMethod.CASH })).rejects.toThrow(
        new NotFoundException('Produit introuvable.'),
      );
      await expect(service.create({ items: [{ productId: 'p-old', quantity: 1 }], paymentMethod: PaymentMethod.CASH })).rejects.toThrow(
        'Produit indisponible : Gourde 2019.',
      );
    });

    it('prices the lines, captures their cost, moves the stock and publishes after the commit', async () => {
      const catalogue = [whey(), water(), coaching()];
      const { service, manager, products, events, movements } = setup(catalogue);

      const dto = await service.create({
        items: [
          { productId: 'p-whey', quantity: 1 },
          { productId: 'p-water', quantity: 2 },
          { productId: 'p-pt', quantity: 1 },
          { productId: 'p-whey', quantity: 1 },
        ],
        discount: 12.2,
        paymentMethod: PaymentMethod.CARD,
        memberId: 'm-1',
        memberName: '  Amira Ben Salah ',
        memberEmail: ' amira@example.com ',
        actor,
      });

      // Products are locked in a stable order so concurrent sales cannot deadlock.
      expect(manager.find).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } }),
      );
      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT ("key")'), ['sale-2026']);

      const saved = manager.save.mock.calls.map(([row]) => row).find((row) => row instanceof Sale) as Sale;
      expect(saved).toMatchObject({
        number: 'V-2026-000123',
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        memberEmail: 'amira@example.com',
        subtotal: 212.2,
        discount: 12.2,
        total: 200,
        status: SaleStatus.COMPLETED,
        soldById: 'u-staff',
        soldByName: 'Sami',
      });
      // Cost at sale time: known cost, 0 for a service without cost, null when unknown (flagged in the KPIs).
      expect(saved.items).toEqual([
        { productId: 'p-whey', name: 'Whey 1 kg', quantity: 2, unitPrice: 89.9, total: 179.8, unitCost: 60 },
        { productId: 'p-water', name: 'Eau 1,5 L', quantity: 2, unitPrice: 1.2, total: 2.4, unitCost: null },
        { productId: 'p-pt', name: 'Séance coaching', quantity: 1, unitPrice: 30, total: 30, unitCost: 0 },
      ]);

      // Services are not stocked; whey 6 → 4 crosses its threshold of 5.
      expect(movements.map((m) => [m.productId, m.type, m.quantity, m.reason])).toEqual([
        ['p-whey', StockMovementType.SALE, -2, 'Vente V-2026-000123'],
        ['p-water', StockMovementType.SALE, -2, 'Vente V-2026-000123'],
      ]);
      expect(products.publishLowStock).toHaveBeenCalledWith([{ productId: 'p-whey', name: 'Whey 1 kg', stock: 4, threshold: 5 }]);

      expect(events.publish).toHaveBeenCalledWith(EVENTS.saleCompleted, {
        saleId: 'sale-1',
        number: 'V-2026-000123',
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        email: 'amira@example.com',
        items: [
          { name: 'Whey 1 kg', quantity: 2, unitPrice: 89.9, total: 179.8 },
          { name: 'Eau 1,5 L', quantity: 2, unitPrice: 1.2, total: 2.4 },
          { name: 'Séance coaching', quantity: 1, unitPrice: 30, total: 30 },
        ],
        total: 200,
        paymentMethod: PaymentMethod.CARD,
        createdAt: NOW.toISOString(),
      });
      expect(dto.items.every((item) => !('unitCost' in item))).toBe(true);
      expect(dto.total).toBe(200);
    });

    it('stores an anonymous counter sale with null member fields', async () => {
      const { service, manager } = setup([water()]);
      await service.create({ items: [{ productId: 'p-water', quantity: 1 }], paymentMethod: PaymentMethod.CASH, memberName: '   ' });
      const saved = manager.save.mock.calls.map(([row]) => row).find((row) => row instanceof Sale) as Sale;
      expect(saved).toMatchObject({ memberId: null, memberName: null, memberEmail: null, soldById: null, discount: 0, total: 1.2 });
    });

    it('rolls back the whole sale when one line lacks stock', async () => {
      const { service, events, products } = setup([whey(), water()]);
      await expect(
        service.create({
          items: [
            { productId: 'p-water', quantity: 1 },
            { productId: 'p-whey', quantity: 7 },
          ],
          paymentMethod: PaymentMethod.CASH,
        }),
      ).rejects.toThrow(new ConflictException('Stock insuffisant pour Whey 1 kg (disponible : 6).'));
      expect(events.publish).not.toHaveBeenCalled();
      expect(products.publishLowStock).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    function soldSale(status = SaleStatus.COMPLETED): Sale {
      return Object.assign(new Sale(), {
        id: 'sale-1',
        number: 'V-2026-000123',
        memberId: null,
        memberName: null,
        memberEmail: null,
        items: [
          { productId: 'p-whey', name: 'Whey 1 kg', quantity: 2, unitPrice: 89.9, total: 179.8, unitCost: 60 },
          { productId: 'p-pt', name: 'Séance coaching', quantity: 1, unitPrice: 30, total: 30, unitCost: 0 },
          { productId: 'p-deleted', name: 'Ancien article', quantity: 1, unitPrice: 5, total: 5, unitCost: null },
        ],
        subtotal: 214.8,
        discount: 0,
        total: 214.8,
        paymentMethod: PaymentMethod.CASH,
        status,
        soldById: null,
        soldByName: null,
        refundedAt: null,
        refundedByName: null,
        createdAt: new Date('2026-11-01T17:00:00.000Z'),
      });
    }

    it('answers 404 for an unknown sale and 409 for a second refund', async () => {
      await expect(setup([]).service.refund({ id: 'sale-x' })).rejects.toThrow(new NotFoundException('Vente introuvable.'));
      await expect(setup([], soldSale(SaleStatus.REFUNDED)).service.refund({ id: 'sale-1' })).rejects.toThrow(
        new ConflictException('Cette vente est déjà remboursée.'),
      );
    });

    it('puts stocked items back and marks the sale refunded', async () => {
      const whey = product({ id: 'p-whey', name: 'Whey 1 kg', price: 89.9, stock: 3 });
      const coaching = product({ id: 'p-pt', name: 'Séance coaching', category: ProductCategory.SERVICE, price: 30, stock: null });
      const { service, movements } = setup([whey, coaching], soldSale());

      const dto = await service.refund({ id: 'sale-1', actor });

      expect(movements.map((m) => [m.productId, m.type, m.quantity, m.reason, m.createdByName])).toEqual([
        ['p-whey', StockMovementType.RETURN, 2, 'Remboursement V-2026-000123', 'Sami'],
      ]);
      expect(whey.stock).toBe(5);
      expect(dto.status).toBe(SaleStatus.REFUNDED);
    });
  });
});
