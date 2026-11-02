import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StockLowEvent, StockMovementType } from '@app/common';
import { Product } from './product.entity';
import { StockMovement } from './stock-movement.entity';
import { computeStockChange, crossedBelowThreshold, isLowStock } from './stock.rules';

export interface StockApplication {
  movement: StockMovement;
  /** Set when this change pushed the product to/below its low-stock threshold. */
  lowEvent: StockLowEvent | null;
}

/**
 * Applies a stock change to a product row that the caller already locked
 * (pessimistic_write) inside `manager`'s transaction, and records the movement.
 */
export async function applyStockChange(
  manager: EntityManager,
  product: Product,
  type: StockMovementType,
  quantity: number,
  options: { unitCost?: number | null; reason?: string | null; createdByName?: string | null } = {},
): Promise<StockApplication> {
  if (product.stock === null) {
    throw new BadRequestException(`Le stock n'est pas suivi pour ${product.name}.`);
  }
  const before = product.stock;
  const { delta, next } = computeStockChange(type, before, quantity, product.name);

  let lowEvent: StockLowEvent | null = null;
  let lowStockAlertedAt = product.lowStockAlertedAt;
  if (crossedBelowThreshold(before, next, product.lowStockThreshold)) {
    lowStockAlertedAt = new Date();
    lowEvent = { productId: product.id, name: product.name, stock: next, threshold: product.lowStockThreshold };
  } else if (!isLowStock(next, product.lowStockThreshold)) {
    lowStockAlertedAt = null;
  }

  await manager.update(Product, { id: product.id }, { stock: next, lowStockAlertedAt });
  product.stock = next;
  product.lowStockAlertedAt = lowStockAlertedAt;

  const movement = await manager.save(
    manager.create(StockMovement, {
      productId: product.id,
      type,
      quantity: delta,
      unitCost: options.unitCost ?? null,
      reason: options.reason ?? null,
      createdByName: options.createdByName ?? null,
    }),
  );
  movement.product = product;
  return { movement, lowEvent };
}
