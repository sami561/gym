import { BadRequestException, ConflictException } from '@nestjs/common';
import { StockMovementType } from '@app/common';

export interface StockChange {
  /** Signed quantity applied to the stock. */
  delta: number;
  next: number;
}

/**
 * IN / RETURN add units, OUT / SALE remove units (never below 0),
 * ADJUSTMENT sets the counted stock and records the difference.
 */
export function computeStockChange(
  type: StockMovementType,
  current: number,
  quantity: number,
  productName: string,
): StockChange {
  if (!Number.isInteger(quantity)) {
    throw new BadRequestException('La quantité doit être un nombre entier.');
  }
  switch (type) {
    case StockMovementType.IN:
    case StockMovementType.RETURN:
      if (quantity <= 0) throw new BadRequestException('La quantité doit être supérieure à 0.');
      return { delta: quantity, next: current + quantity };
    case StockMovementType.OUT:
    case StockMovementType.SALE: {
      if (quantity <= 0) throw new BadRequestException('La quantité doit être supérieure à 0.');
      const next = current - quantity;
      if (next < 0) {
        throw new ConflictException(`Stock insuffisant pour ${productName} (disponible : ${current}).`);
      }
      return { delta: -quantity, next };
    }
    case StockMovementType.ADJUSTMENT:
      if (quantity < 0) throw new BadRequestException('Le stock compté ne peut pas être négatif.');
      return { delta: quantity - current, next: quantity };
    default:
      throw new BadRequestException('Type de mouvement de stock inconnu.');
  }
}

export function isLowStock(stock: number | null, threshold: number): boolean {
  return stock !== null && stock <= threshold;
}

/** True when the stock just went from above the threshold to at/below it. */
export function crossedBelowThreshold(before: number, after: number, threshold: number): boolean {
  return before > threshold && after <= threshold;
}
