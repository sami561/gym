import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { StockMovementType, decimalTransformer } from '@app/common';
import { Product } from './product.entity';

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'enum', enum: StockMovementType, enumName: 'stock_movement_type' })
  type: StockMovementType;

  /** Signed quantity applied to the stock (+ in, - out). */
  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true, transformer: decimalTransformer })
  unitCost: number | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByName: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
