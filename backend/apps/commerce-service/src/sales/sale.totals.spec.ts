import { BadRequestException } from '@nestjs/common';
import { computeSaleTotals, formatSaleNumber, mergeSaleItems } from './sale.totals';

describe('sale totals', () => {
  const lines = [
    { productId: 'a', name: 'Whey 1 kg', quantity: 2, unitPrice: 89.9, unitCost: 60 },
    { productId: 'b', name: 'Eau 1,5 L', quantity: 3, unitPrice: 1.2, unitCost: null },
  ];

  it('computes line totals, subtotal and total to the millime', () => {
    const totals = computeSaleTotals(lines, 0);
    expect(totals.items.map((item) => item.total)).toEqual([179.8, 3.6]);
    expect(totals.subtotal).toBe(183.4);
    expect(totals.total).toBe(183.4);
  });

  it('avoids floating point drift on 3-decimal prices', () => {
    const totals = computeSaleTotals([{ productId: 'c', name: 'Barre', quantity: 3, unitPrice: 0.1, unitCost: 0.05 }], 0.05);
    expect(totals.subtotal).toBe(0.3);
    expect(totals.total).toBe(0.25);
  });

  it('keeps the unit cost captured at sale time on each line', () => {
    expect(computeSaleTotals(lines, 0).items.map((item) => item.unitCost)).toEqual([60, null]);
  });

  it('applies a discount up to the subtotal', () => {
    expect(computeSaleTotals(lines, 13.4).total).toBe(170);
    expect(computeSaleTotals(lines, 183.4).total).toBe(0);
    expect(() => computeSaleTotals(lines, 183.401)).toThrow('La remise ne peut pas dépasser le sous-total.');
    expect(() => computeSaleTotals(lines, -1)).toThrow(BadRequestException);
  });

  it('merges repeated products and validates quantities', () => {
    expect(
      mergeSaleItems([
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 2 },
        { productId: 'a', quantity: 3 },
      ]),
    ).toEqual([
      { productId: 'a', quantity: 4 },
      { productId: 'b', quantity: 2 },
    ]);
    expect(() => mergeSaleItems([])).toThrow(BadRequestException);
    expect(() => mergeSaleItems([{ productId: 'a', quantity: 0 }])).toThrow(BadRequestException);
    expect(() => mergeSaleItems([{ productId: 'a', quantity: 1.5 }])).toThrow(BadRequestException);
  });

  it('formats receipt numbers per year', () => {
    expect(formatSaleNumber(2026, 123)).toBe('V-2026-000123');
  });
});
