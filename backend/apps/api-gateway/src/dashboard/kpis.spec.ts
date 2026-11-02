import { CommerceKpis, MembershipKpis } from '@app/common';
import { combineKpis } from './kpis';

const memberships: MembershipKpis = {
  gross: 1000,
  discounts: 100,
  cancelled: 50,
  net: 850,
  cashCollected: 800,
  mrr: 900,
  activeMembers: 10,
  arpu: 85,
  monthly: [{ month: '2026-11', gross: 1000, discounts: 100, cancelled: 50, net: 850, cash: 800 }],
};

const shop: CommerceKpis = {
  gross: 300,
  discounts: 20,
  refunds: 30,
  net: 250,
  cogs: 120,
  itemsWithoutCost: 0,
  grossMargin: 130,
  expenses: 400,
  expensesByCategory: [],
  monthly: [{ month: '2026-11', gross: 300, discounts: 20, refunds: 30, net: 250, cogs: 120, expenses: 400 }],
};

describe('combineKpis', () => {
  it('computes GMV, NMV and margins across memberships and shop', () => {
    const k = combineKpis('2026-11-01', '2026-11-30', memberships, shop);
    expect(k.gmv).toBe(1300);
    expect(k.nmv).toBe(1100);
    expect(k.grossMargin).toBe(980);
    expect(k.operatingProfit).toBe(580);
    expect(k.operatingMarginPct).toBe(52.7);
    expect(k.monthly).toEqual([{ month: '2026-11', gmv: 1300, nmv: 1100, expenses: 400, profit: 580, marginPct: 52.7 }]);
  });

  it('still answers when one side is down', () => {
    const k = combineKpis('2026-11-01', '2026-11-30', memberships, null);
    expect(k.nmv).toBe(850);
    expect(k.breakdown.shop).toBeNull();
  });
});
