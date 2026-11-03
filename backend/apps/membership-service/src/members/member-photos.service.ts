import { BadRequestException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  MEMBER_PHOTO_ERRORS,
  MEMBER_PHOTO_MAX_BYTES,
  MemberDto,
  MemberPhoto,
  SetMemberPhotoRequest,
} from '@app/common';
import { toMemberDto } from '../mappers';
import { stripJpegMetadata } from './jpeg-metadata';
import { MemberPhotoEntity } from './member-photo.entity';
import { Member } from './member.entity';

/** Length of the base64 text of MEMBER_PHOTO_MAX_BYTES bytes: longer texts are refused before decoding. */
const MAX_BASE64_LENGTH = Math.ceil(MEMBER_PHOTO_MAX_BYTES / 3) * 4;

/**
 * Member photos (docs/API.md, Member photos). The bytes live in member_photos, members.photoUpdatedAt tells
 * clients which version to load; both change in one transaction that first locks the member row (as member
 * deletion does, so the two never deadlock). The bytes are personal data: never logged, never in an event.
 */
@Injectable()
export class MemberPhotosService {
  constructor(
    @InjectRepository(MemberPhotoEntity) private readonly photos: Repository<MemberPhotoEntity>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** 404 'Aucune photo.' for a member without photo, 'Membre introuvable.' for an unknown id. */
  async get(id: string): Promise<MemberPhoto> {
    requireId(id);
    const photo = await this.photos.findOne({ where: { memberId: id } });
    if (!photo) {
      if (!(await this.members.existsBy({ id }))) throw new NotFoundException('Membre introuvable.');
      throw new NotFoundException(MEMBER_PHOTO_ERRORS.none);
    }
    return { data: photo.data.toString('base64'), contentType: 'image/jpeg', updatedAt: photo.updatedAt.toISOString() };
  }

  /**
   * Replaces the photo with the upload stripped of its metadata (the gateway already limits the size; checked
   * again here). photoUpdatedAt moves forward at every upload, so each version gets its own `?v=`.
   */
  async set(req: SetMemberPhotoRequest): Promise<MemberDto> {
    const jpeg = stripJpegMetadata(decodeUpload(req?.data));
    const member = await this.db.transaction(async (tx) => {
      const locked = await lockMember(tx, req.id);
      const at = nextPhotoVersion(locked.photoUpdatedAt, new Date());
      await tx.upsert(MemberPhotoEntity, { memberId: locked.id, data: jpeg, updatedAt: at }, ['memberId']);
      await setPhotoUpdatedAt(tx, locked.id, at);
      return Object.assign(locked, { photoUpdatedAt: at });
    });
    return toMemberDto(member);
  }

  /** Deletes the photo; a member without photo is answered as it is. */
  async remove(id: string): Promise<MemberDto> {
    const member = await this.db.transaction(async (tx) => {
      const locked = await lockMember(tx, id);
      await tx.delete(MemberPhotoEntity, { memberId: locked.id });
      await setPhotoUpdatedAt(tx, locked.id, null);
      return Object.assign(locked, { photoUpdatedAt: null });
    });
    return toMemberDto(member);
  }
}

/** The uploaded bytes: 400 without data, 413 above MEMBER_PHOTO_MAX_BYTES. */
export function decodeUpload(data: unknown): Buffer {
  if (typeof data !== 'string' || !data) throw new BadRequestException(MEMBER_PHOTO_ERRORS.missing);
  if (data.length > MAX_BASE64_LENGTH) throw new PayloadTooLargeException(MEMBER_PHOTO_ERRORS.tooLarge);
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MEMBER_PHOTO_MAX_BYTES) throw new PayloadTooLargeException(MEMBER_PHOTO_ERRORS.tooLarge);
  return bytes;
}

/** `now`, or 1 ms after the previous upload when the clock has not passed it: every upload gets a new version. */
export function nextPhotoVersion(previous: Date | null | undefined, now: Date): Date {
  return previous && previous.getTime() >= now.getTime() ? new Date(previous.getTime() + 1) : now;
}

function requireId(id: string): void {
  if (!id) throw new BadRequestException('Identifiant du membre manquant.');
}

/** The member row, locked until the end of the transaction (404 when unknown). */
async function lockMember(tx: EntityManager, id: string): Promise<Member> {
  requireId(id);
  const member = await tx.findOne(Member, { where: { id }, lock: { mode: 'pessimistic_write' } });
  if (!member) throw new NotFoundException('Membre introuvable.');
  return member;
}

/** In SQL: the column is left out of save() (see Member.photoUpdatedAt). */
async function setPhotoUpdatedAt(tx: EntityManager, memberId: string, at: Date | null): Promise<void> {
  await tx.query(`UPDATE members SET "photoUpdatedAt" = $2, "updatedAt" = now() WHERE id = $1`, [memberId, at]);
}
