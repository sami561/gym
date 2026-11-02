import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentMethod, SaleItemDto, SaleStatus, decimalTransformer } from '@app/common';

/** Stored line: the public SaleItemDto plus the product cost at sale time (internal, for COGS). */
export interface StoredSaleItem extends SaleItemDto {
  /** null when the product had no cost (older sales may not have the key at all). */
  unitCost?: number | null;
}

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Receipt number V-YYYY-000123 (per-year counter). */
  @Column({ type: 'varchar', unique: true })
  number: string;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  memberId: string | null;

  @Column({ type: 'varchar', nullable: true })
  memberName: string | null;

  @Column({ type: 'varchar', nullable: true })
  memberEmail: string | null;

  /** Snapshot of the sold lines (names, prices and costs at sale time). */
  @Column({ type: 'jsonb' })
  items: StoredSaleItem[];

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  subtotal: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0, transformer: decimalTransformer })
  discount: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  total: number;

  @Column({ type: 'enum', enum: PaymentMethod, enumName: 'sale_payment_method' })
  paymentMethod: PaymentMethod;

  @Column({ type: 'enum', enum: SaleStatus, enumName: 'sale_status', default: SaleStatus.COMPLETED })
  status: SaleStatus;

  @Column({ type: 'varchar', nullable: true })
  soldById: string | null;

  @Column({ type: 'varchar', nullable: true })
  soldByName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  refundedByName: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
