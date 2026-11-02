import { ExpenseDto, ProductCategory, ProductDto, SaleDto, StockMovementDto } from '@app/common';
import { Product } from './products/product.entity';
import { StockMovement } from './products/stock-movement.entity';
import { isLowStock } from './products/stock.rules';
import { Sale } from './sales/sale.entity';
import { Expense } from './expenses/expense.entity';

export function toProductDto(product: Product): ProductDto {
  const stock = product.category === ProductCategory.SERVICE ? null : product.stock;
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    price: product.price,
    cost: product.cost,
    stock,
    lowStockThreshold: product.lowStockThreshold,
    isActive: product.isActive,
    imageUrl: product.imageUrl,
    isLowStock: isLowStock(stock, product.lowStockThreshold),
  };
}

export function toMovementDto(movement: StockMovement, productName?: string): StockMovementDto {
  return {
    id: movement.id,
    productId: movement.productId,
    productName: productName ?? movement.product?.name ?? '',
    type: movement.type,
    quantity: movement.quantity,
    unitCost: movement.unitCost,
    reason: movement.reason,
    createdByName: movement.createdByName,
    createdAt: movement.createdAt.toISOString(),
  };
}

export function toSaleDto(sale: Sale): SaleDto {
  return {
    id: sale.id,
    number: sale.number,
    memberId: sale.memberId,
    memberName: sale.memberName,
    items: sale.items.map(({ productId, name, quantity, unitPrice, total }) => ({ productId, name, quantity, unitPrice, total })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    soldByName: sale.soldByName,
    createdAt: sale.createdAt.toISOString(),
  };
}

export function toExpenseDto(expense: Expense): ExpenseDto {
  return {
    id: expense.id,
    category: expense.category,
    label: expense.label,
    amount: expense.amount,
    date: expense.date,
    paymentMethod: expense.paymentMethod,
    supplier: expense.supplier,
    reference: expense.reference,
    source: expense.source,
    createdByName: expense.createdByName,
    createdAt: expense.createdAt.toISOString(),
  };
}
