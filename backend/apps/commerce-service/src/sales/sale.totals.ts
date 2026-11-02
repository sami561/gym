import { BadRequestException } from '@nestjs/common';
import { fromMillimes, toMillimes } from '../shared/money';
import { StoredSaleItem } from './sale.entity';

export interface RequestedItem {
  productId: string;
  quantity: number;
}

export interface PricedLine extends RequestedItem {
  name: string;
  unitPrice: number;
  /** Product cost at sale time, null when unknown. */
  unitCost: number | null;
}

export interface SaleTotals {
  items: StoredSaleItem[];
  subtotal: number;
  discount: number;
  total: number;
}

/** Validates quantities and merges repeated products into one line (first-seen order). */
export function mergeSaleItems(items: RequestedItem[] | undefined): RequestedItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new BadRequestException('Ajoutez au moins un article à la vente.');
  }
  const merged = new Map<string, number>();
  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!item?.productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Chaque article doit avoir un produit et une quantité entière positive.');
    }
    merged.set(item.productId, (merged.get(item.productId) ?? 0) + quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Line totals, subtotal, discount and total, exact to the millime. */
export function computeSaleTotals(lines: PricedLine[], discount = 0): SaleTotals {
  if (lines.length === 0) throw new BadRequestException('Ajoutez au moins un article à la vente.');
  if (!Number.isFinite(discount) || discount < 0) {
    throw new BadRequestException('La remise doit être un montant positif.');
  }
  let subtotal = 0;
  const items = lines.map((line) => {
    const unit = toMillimes(line.unitPrice);
    const lineTotal = unit * line.quantity;
    subtotal += lineTotal;
    return {
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: fromMillimes(unit),
      total: fromMillimes(lineTotal),
      unitCost: line.unitCost === null ? null : fromMillimes(toMillimes(line.unitCost)),
    };
  });
  const discountMillimes = toMillimes(discount);
  if (discountMillimes > subtotal) {
    throw new BadRequestException('La remise ne peut pas dépasser le sous-total.');
  }
  return {
    items,
    subtotal: fromMillimes(subtotal),
    discount: fromMillimes(discountMillimes),
    total: fromMillimes(subtotal - discountMillimes),
  };
}

export function formatSaleNumber(year: number, sequence: number): string {
  return `V-${year}-${String(sequence).padStart(6, '0')}`;
}
