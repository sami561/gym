import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductCategory, StockMovementType } from '@app/common';
import { Product } from './product.entity';
import { StockMovement } from './stock-movement.entity';
import { applyStockChange } from './stock.ledger';

function product(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), {
    id: 'p-1',
    name: 'Whey 1 kg',
    sku: null,
    category: ProductCategory.SUPPLEMENT,
    price: 89.9,
    cost: 60,
    stock: 7,
    lowStockThreshold: 5,
    isActive: true,
    imageUrl: null,
    lowStockAlertedAt: null,
    ...overrides,
  });
}

/** Transaction manager double: records the product update and the saved movement. */
function fakeManager() {
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const create = jest.fn((_entity: unknown, data: Partial<StockMovement>) => Object.assign(new StockMovement(), data));
  const save = jest.fn(async (row: StockMovement) => Object.assign(row, { id: 'mv-1', createdAt: new Date() }));
  return { manager: { update, create, save } as unknown as EntityManager, update, create, save };
}

describe('applyStockChange (stock ledger)', () => {
  it('refuses products whose stock is not tracked', async () => {
    const { manager, update } = fakeManager();
    const service = product({ category: ProductCategory.SERVICE, name: 'Séance coaching', stock: null });
    await expect(applyStockChange(manager, service, StockMovementType.SALE, 1)).rejects.toThrow(
      new BadRequestException("Le stock n'est pas suivi pour Séance coaching."),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('records a sale as a negative movement and raises the low-stock alert once crossed', async () => {
    const { manager, update, save } = fakeManager();
    const whey = product({ stock: 7 });
    const { movement, lowEvent } = await applyStockChange(manager, whey, StockMovementType.SALE, 3, {
      reason: 'Vente V-2026-000123',
      createdByName: 'Sami',
    });

    expect(lowEvent).toEqual({ productId: 'p-1', name: 'Whey 1 kg', stock: 4, threshold: 5 });
    expect(update).toHaveBeenCalledWith(Product, { id: 'p-1' }, { stock: 4, lowStockAlertedAt: expect.any(Date) });
    expect(save).toHaveBeenCalledTimes(1);
    expect(movement).toMatchObject({
      productId: 'p-1',
      type: StockMovementType.SALE,
      quantity: -3,
      unitCost: null,
      reason: 'Vente V-2026-000123',
      createdByName: 'Sami',
    });
    expect(movement.product).toBe(whey);
    expect(whey.stock).toBe(4);
  });

  it('does not alert again while the product stays low', async () => {
    const { manager, update } = fakeManager();
    const alertedAt = new Date('2026-11-01T08:00:00.000Z');
    const { lowEvent } = await applyStockChange(manager, product({ stock: 4, lowStockAlertedAt: alertedAt }), StockMovementType.SALE, 1);
    expect(lowEvent).toBeNull();
    expect(update).toHaveBeenCalledWith(Product, { id: 'p-1' }, { stock: 3, lowStockAlertedAt: alertedAt });
  });

  it('re-arms the alert when a delivery brings the stock back above the threshold', async () => {
    const { manager, update } = fakeManager();
    const whey = product({ stock: 2, lowStockAlertedAt: new Date('2026-11-01T08:00:00.000Z') });
    const { movement, lowEvent } = await applyStockChange(manager, whey, StockMovementType.IN, 10, { unitCost: 58.5 });
    expect(lowEvent).toBeNull();
    expect(update).toHaveBeenCalledWith(Product, { id: 'p-1' }, { stock: 12, lowStockAlertedAt: null });
    expect(movement).toMatchObject({ quantity: 10, unitCost: 58.5, reason: null, createdByName: null });
    expect(whey.lowStockAlertedAt).toBeNull();
  });

  it('alerts when an inventory count lands exactly on the threshold', async () => {
    const { manager } = fakeManager();
    const { movement, lowEvent } = await applyStockChange(manager, product({ stock: 9 }), StockMovementType.ADJUSTMENT, 5);
    expect(movement.quantity).toBe(-4);
    expect(lowEvent).toEqual({ productId: 'p-1', name: 'Whey 1 kg', stock: 5, threshold: 5 });
  });

  it('writes nothing when there is not enough stock', async () => {
    const { manager, update, save } = fakeManager();
    await expect(applyStockChange(manager, product({ stock: 2 }), StockMovementType.SALE, 3)).rejects.toThrow(
      new ConflictException('Stock insuffisant pour Whey 1 kg (disponible : 2).'),
    );
    expect(update).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
