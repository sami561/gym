import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * A coach's photo for the website: a JPEG of at most PHOTO_MAX_BYTES without its metadata segments
 * (libs/common utils/jpeg-metadata.ts). Kept out of `users` so user lists and logins never load the bytes. The
 * primary key makes it one photo per user; deleting the user deletes it (FK cascade). users.avatarUrl points to
 * it (coachPhotoUrl) while it exists. Personal data: never logged, never in events.
 */
@Entity('user_photos')
export class UserPhotoEntity {
  @PrimaryColumn('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column({ type: 'bytea' })
  data: Buffer;

  /** The upload instant: the `v` of users.avatarUrl. */
  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
