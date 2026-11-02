import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('push_tokens')
@Unique(['userId', 'token'])
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** auth user id (= member id for members). */
  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  /** Expo push token, e.g. ExponentPushToken[xxxx]. */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  token: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
