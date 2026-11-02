import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PromoType, decimalTransformer } from '@app/common';

@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  code: string;

  @Column({ type: 'enum', enum: PromoType })
  type: PromoType;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: decimalTransformer })
  value: number;

  @Column({ type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ type: 'date', nullable: true })
  validUntil: string | null;

  @Column({ type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ type: 'int', default: 0 })
  uses: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
