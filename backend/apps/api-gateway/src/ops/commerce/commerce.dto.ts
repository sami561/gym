import { OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExpenseCategory, PaymentMethod, ProductCategory, StockMovementType } from '@app/common';
import { QueryBoolean } from '../query';

export class ListProductsQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @QueryBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @QueryBoolean()
  lowStockOnly?: boolean;
}

export class CreateProductDto {
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sku?: string;

  @IsEnum(ProductCategory)
  category: ProductCategory;

  /** Selling price (TND). */
  @IsNumber()
  @Min(0)
  price: number;

  /** Purchase cost (TND). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  /** Initial stock (creates an IN movement); ignored for SERVICE products. */
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}

/** Stock changes go through stock movements, not product updates. */
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['stock'] as const)) {}

export class CreateStockMovementDto {
  @IsUUID()
  productId: string;

  @IsIn([StockMovementType.IN, StockMovementType.OUT, StockMovementType.ADJUSTMENT])
  type: StockMovementType.IN | StockMovementType.OUT | StockMovementType.ADJUSTMENT;

  /** Units moved; for ADJUSTMENT, the stock actually counted. */
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListStockMovementsQuery {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class SaleItemInputDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

export class CreateSaleDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Le panier est vide.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items: SaleItemInputDto[];

  /** Optional member (receipt by e-mail, purchase history). */
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}

export class ListSalesQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class ListExpensesQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;
}

export class CreateExpenseDto {
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @IsString()
  @Length(1, 120)
  label: string;

  @IsNumber()
  @Min(0.001)
  amount: number;

  /** YYYY-MM-DD */
  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class FinanceQuery {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}
