import { ExpenseCategory, PaymentMethod, ProductCategory, SaleStatus, StockMovementType } from '@app/common';
import { toExpenseDto, toMovementDto, toProductDto, toSaleDto } from './mappers';
import { Product } from './products/product.entity';
import { StockMovement } from './products/stock-movement.entity';
import { Sale } from './sales/sale.entity';
import { Expense } from './expenses/expense.entity';

const at = new Date('2026-11-02T09:15:00.000Z');

function product(overrides: Partial<Product> = {}): Product {
  return Object.assign(new Product(), {
    id: 'p-1',
    name: 'Whey 1 kg',
    sku: 'WHEY-1KG',
    category: ProductCategory.SUPPLEMENT,
    price: 89.9,
    cost: 60,
    stock: 12,
    lowStockThreshold: 5,
    isActive: true,
    imageUrl: null,
    lowStockAlertedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });
}

describe('commerce mappers', () => {
  describe('toProductDto', () => {
    it('maps the catalogue fields only', () => {
      expect(toProductDto(product())).toEqual({
        id: 'p-1',
        name: 'Whey 1 kg',
        sku: 'WHEY-1KG',
        category: ProductCategory.SUPPLEMENT,
        price: 89.9,
        cost: 60,
        stock: 12,
        lowStockThreshold: 5,
        isActive: true,
        imageUrl: null,
        isLowStock: false,
      });
    });

    it('flags low stock at the threshold', () => {
      expect(toProductDto(product({ stock: 5 })).isLowStock).toBe(true);
      expect(toProductDto(product({ stock: 0 })).isLowStock).toBe(true);
    });

    it('never shows stock for services, even if a value was stored', () => {
      const dto = toProductDto(product({ category: ProductCategory.SERVICE, name: 'Séance coaching', stock: 0 }));
      expect(dto.stock).toBeNull();
      expect(dto.isLowStock).toBe(false);
    });
  });

  describe('toMovementDto', () => {
    const movement = Object.assign(new StockMovement(), {
      id: 'mv-1',
      productId: 'p-1',
      type: StockMovementType.SALE,
      quantity: -2,
      unitCost: null,
      reason: 'Vente V-2026-000123',
      createdByName: 'Sami',
      createdAt: at,
    });

    it('names the product from the argument, then the relation, else empty', () => {
      expect(toMovementDto(movement, 'Barre protéinée').productName).toBe('Barre protéinée');
      expect(toMovementDto(Object.assign(new StockMovement(), movement, { product: product() })).productName).toBe('Whey 1 kg');
      expect(toMovementDto(movement).productName).toBe('');
    });

    it('keeps the signed quantity and ISO time', () => {
      expect(toMovementDto(movement, 'Whey 1 kg')).toEqual({
        id: 'mv-1',
        productId: 'p-1',
        productName: 'Whey 1 kg',
        type: StockMovementType.SALE,
        quantity: -2,
        unitCost: null,
        reason: 'Vente V-2026-000123',
        createdByName: 'Sami',
        createdAt: '2026-11-02T09:15:00.000Z',
      });
    });
  });

  describe('toSaleDto', () => {
    it('drops the internal cost of each line, the e-mail and the seller id', () => {
      const sale = Object.assign(new Sale(), {
        id: 's-1',
        number: 'V-2026-000123',
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        memberEmail: 'amira@example.com',
        items: [{ productId: 'p-1', name: 'Whey 1 kg', quantity: 2, unitPrice: 89.9, total: 179.8, unitCost: 60 }],
        subtotal: 179.8,
        discount: 9.8,
        total: 170,
        paymentMethod: PaymentMethod.CARD,
        status: SaleStatus.COMPLETED,
        soldById: 'u-staff',
        soldByName: 'Sami',
        refundedAt: null,
        refundedByName: null,
        createdAt: at,
      });
      expect(toSaleDto(sale)).toEqual({
        id: 's-1',
        number: 'V-2026-000123',
        memberId: 'm-1',
        memberName: 'Amira Ben Salah',
        items: [{ productId: 'p-1', name: 'Whey 1 kg', quantity: 2, unitPrice: 89.9, total: 179.8 }],
        subtotal: 179.8,
        discount: 9.8,
        total: 170,
        paymentMethod: PaymentMethod.CARD,
        status: SaleStatus.COMPLETED,
        soldByName: 'Sami',
        createdAt: '2026-11-02T09:15:00.000Z',
      });
    });
  });

  describe('toExpenseDto', () => {
    it('hides the automatic source id and the author id', () => {
      const expense = Object.assign(new Expense(), {
        id: 'e-1',
        category: ExpenseCategory.SALARY,
        label: 'Salaire octobre',
        amount: 1450.5,
        date: '2026-11-01',
        paymentMethod: PaymentMethod.TRANSFER,
        supplier: null,
        reference: null,
        source: 'payroll' as const,
        sourceId: 'payroll:pr-1',
        createdById: 'u-admin',
        createdByName: 'Admin',
        createdAt: at,
        updatedAt: at,
      });
      expect(toExpenseDto(expense)).toEqual({
        id: 'e-1',
        category: ExpenseCategory.SALARY,
        label: 'Salaire octobre',
        amount: 1450.5,
        date: '2026-11-01',
        paymentMethod: PaymentMethod.TRANSFER,
        supplier: null,
        reference: null,
        source: 'payroll',
        createdByName: 'Admin',
        createdAt: '2026-11-02T09:15:00.000Z',
      });
    });
  });
});
