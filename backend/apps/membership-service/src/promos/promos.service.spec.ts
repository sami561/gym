import { PromoType } from '@app/common';
import { promoDiscount } from './promos.service';

describe('promoDiscount', () => {
  it('applies percentages with 3 decimals', () => {
    expect(promoDiscount({ type: PromoType.PERCENT, value: 15 }, 99.9)).toBe(14.985);
  });

  it('never discounts more than the price', () => {
    expect(promoDiscount({ type: PromoType.FIXED, value: 150 }, 100)).toBe(100);
  });
});
