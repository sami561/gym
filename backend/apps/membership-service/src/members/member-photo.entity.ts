import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Member } from './member.entity';

/**
 * A member's photo: a JPEG of at most PHOTO_MAX_BYTES without its metadata segments
 * (libs/common utils/jpeg-metadata.ts). Kept out of `members` so member lists never load the bytes. The primary key makes it
 * one photo per member; deleting the member deletes it (FK cascade, and explicitly in MembersService).
 * Personal data: never logged, never in events.
 */
@Entity('member_photos')
export class MemberPhotoEntity {
  @PrimaryColumn('uuid')
  memberId: string;

  @ManyToOne(() => Member, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'memberId' })
  member?: Member;

  @Column({ type: 'bytea' })
  data: Buffer;

  /** Same instant as members.photoUpdatedAt (written in the same transaction). */
  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
