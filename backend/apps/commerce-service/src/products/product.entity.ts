import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ProductCategory, decimalTransformer } from '@app/common';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  sku: string | null;

  @Column({ type: 'enum', enum: ProductCategory, enumName: 'product_category' })
  category: ProductCategory;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  price: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true, transformer: decimalTransformer })
  cost: number | null;

  /** Units on hand; null for SERVICE products (not tracked). */
  @Column({ type: 'int', nullable: true })
  stock: number | null;

  @Column({ type: 'int', default: 5 })
  lowStockThreshold: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  /** Last stock.low alert; reset when the stock goes back above the threshold. */
  @Column({ type: 'timestamptz', nullable: true })
  lowStockAlertedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
