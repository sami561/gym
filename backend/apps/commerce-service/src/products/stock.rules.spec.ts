import { BadRequestException, ConflictException } from '@nestjs/common';
import { StockMovementType } from '@app/common';
import { computeStockChange, crossedBelowThreshold, isLowStock } from './stock.rules';

describe('stock rules', () => {
  it('adds units on IN and RETURN', () => {
    expect(computeStockChange(StockMovementType.IN, 4, 6, 'Whey')).toEqual({ delta: 6, next: 10 });
    expect(computeStockChange(StockMovementType.RETURN, 0, 2, 'Whey')).toEqual({ delta: 2, next: 2 });
  });

  it('removes units on OUT and SALE but never below zero', () => {
    expect(computeStockChange(StockMovementType.SALE, 5, 5, 'Whey')).toEqual({ delta: -5, next: 0 });
    expect(() => computeStockChange(StockMovementType.OUT, 3, 4, 'Whey')).toThrow(ConflictException);
    expect(() => computeStockChange(StockMovementType.SALE, 3, 4, 'Whey')).toThrow(
      'Stock insuffisant pour Whey (disponible : 3).',
    );
  });

  it('sets the counted stock on ADJUSTMENT and records the signed delta', () => {
    expect(computeStockChange(StockMovementType.ADJUSTMENT, 12, 9, 'Shaker')).toEqual({ delta: -3, next: 9 });
    expect(computeStockChange(StockMovementType.ADJUSTMENT, 2, 7, 'Shaker')).toEqual({ delta: 5, next: 7 });
    expect(computeStockChange(StockMovementType.ADJUSTMENT, 4, 0, 'Shaker')).toEqual({ delta: -4, next: 0 });
    expect(() => computeStockChange(StockMovementType.ADJUSTMENT, 4, -1, 'Shaker')).toThrow(BadRequestException);
  });

  it('rejects non-integer and non-positive quantities', () => {
    expect(() => computeStockChange(StockMovementType.IN, 1, 1.5, 'Barre')).toThrow(BadRequestException);
    expect(() => computeStockChange(StockMovementType.IN, 1, 0, 'Barre')).toThrow(BadRequestException);
    expect(() => computeStockChange(StockMovementType.OUT, 1, -2, 'Barre')).toThrow(BadRequestException);
  });

  it('detects low stock and downward threshold crossings only', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(null, 5)).toBe(false);
    expect(crossedBelowThreshold(6, 5, 5)).toBe(true);
    expect(crossedBelowThreshold(8, 2, 5)).toBe(true);
    expect(crossedBelowThreshold(5, 4, 5)).toBe(false); // already low
    expect(crossedBelowThreshold(3, 9, 5)).toBe(false); // going up
  });
});
