import { Actor } from './common.contracts';
import { PaymentMethod } from './membership.contracts';

export enum ProductCategory {
  SUPPLEMENT = 'SUPPLEMENT',
  DRINK = 'DRINK',
  SNACK = 'SNACK',
  APPAREL = 'APPAREL',
  ACCESSORY = 'ACCESSORY',
  SERVICE = 'SERVICE',
}

export enum StockMovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
  SALE = 'SALE',
  RETURN = 'RETURN',
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  REFUNDED = 'REFUNDED',
}

export enum ExpenseCategory {
  RENT = 'RENT',
  SALARY = 'SALARY',
  UTILITIES = 'UTILITIES',
  MAINTENANCE = 'MAINTENANCE',
  EQUIPMENT = 'EQUIPMENT',
  MARKETING = 'MARKETING',
  SUPPLIES = 'SUPPLIES',
  TAXES = 'TAXES',
  OTHER = 'OTHER',
}

export interface ProductDto {
  id: string;
  name: string;
  sku: string | null;
  category: ProductCategory;
  price: number;
  cost: number | null;
  /** Not tracked for SERVICE products (always null). */
  stock: number | null;
  lowStockThreshold: number;
  isActive: boolean;
  imageUrl: string | null;
  isLowStock: boolean;
}

export interface CreateProductRequest {
  name: string;
  sku?: string | null;
  category: ProductCategory;
  price: number;
  cost?: number | null;
  /** Initial stock (creates an IN movement). */
  stock?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  imageUrl?: string | null;
}

export interface UpdateProductRequest {
  id: string;
  /** Stock changes go through stock movements, not here. */
  data: Partial<Omit<CreateProductRequest, 'stock'>>;
}

export interface ListProductsRequest {
  search?: string;
  category?: ProductCategory;
  includeInactive?: boolean;
  lowStockOnly?: boolean;
}

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  /** Signed quantity applied to the stock. */
  quantity: number;
  unitCost: number | null;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateStockMovementRequest {
  productId: string;
  type: StockMovementType.IN | StockMovementType.OUT | StockMovementType.ADJUSTMENT;
  /** Positive number; ADJUSTMENT sets the absolute counted stock. */
  quantity: number;
  unitCost?: number | null;
  reason?: string | null;
  actor?: Actor;
}

export interface ListStockMovementsRequest {
  productId?: string;
  limit?: number;
}

export interface SaleItemDto {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SaleDto {
  id: string;
  /** Receipt number, e.g. V-2026-000123. */
  number: string;
  memberId: string | null;
  memberName: string | null;
  items: SaleItemDto[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  soldByName: string | null;
  createdAt: string;
}

export interface CreateSaleRequest {
  items: { productId: string; quantity: number }[];
  memberId?: string | null;
  memberName?: string | null;
  memberEmail?: string | null;
  discount?: number;
  paymentMethod: PaymentMethod;
  actor?: Actor;
}

export interface ListSalesRequest {
  from?: string;
  to?: string;
  memberId?: string;
  page?: number;
  pageSize?: number;
}

export interface SalesPage {
  items: SaleDto[];
  total: number;
  page: number;
  pageSize: number;
  sum: number;
}

export interface RefundSaleRequest {
  id: string;
  actor?: Actor;
}

export interface ExpenseDto {
  id: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  paymentMethod: PaymentMethod | null;
  supplier: string | null;
  reference: string | null;
  /** 'manual' | 'payroll' | 'maintenance' — automatic expenses come from domain events. */
  source: string;
  createdByName: string | null;
  createdAt: string;
}

export interface CreateExpenseRequest {
  category: ExpenseCategory;
  label: string;
  amount: number;
  date: string;
  paymentMethod?: PaymentMethod | null;
  supplier?: string | null;
  reference?: string | null;
  actor?: Actor;
}

export interface UpdateExpenseRequest {
  id: string;
  data: Partial<Omit<CreateExpenseRequest, 'actor'>>;
}

export interface ListExpensesRequest {
  from?: string;
  to?: string;
  category?: ExpenseCategory;
}

export interface FinanceMonth {
  /** YYYY-MM */
  month: string;
  membershipRevenue: number;
  salesRevenue: number;
  expenses: number;
  profit: number;
}

export interface FinanceSummaryRequest {
  months?: number;
}

export interface FinanceSummary {
  months: FinanceMonth[];
  expensesByCategory: { category: ExpenseCategory; total: number }[];
  thisMonth: FinanceMonth;
}

export interface CommerceStats {
  salesToday: number;
  salesThisMonth: number;
  expensesThisMonth: number;
  lowStockProducts: number;
}
