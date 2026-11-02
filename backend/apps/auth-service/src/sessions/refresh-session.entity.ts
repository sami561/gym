import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { RefreshFamilyState } from './refresh-rotation';

/**
 * One sign-in ("family") of a user. Its refresh tokens carry its id (fam) and a single-use jti:
 * each refresh replaces currentJti, and replaying an older token revokes the whole family.
 */
@Entity('refresh_sessions')
export class RefreshSession implements RefreshFamilyState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  /** jti of the newest refresh token of the family. */
  @Column('uuid')
  currentJti: string;

  /** jti that currentJti replaced: still honoured for REFRESH_REUSE_LEEWAY_SECONDS after rotatedAt. */
  @Column({ type: 'uuid', nullable: true })
  previousJti: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  /** Slides with every refresh, like the refresh tokens themselves. */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  lastUsedAt: Date;
}
