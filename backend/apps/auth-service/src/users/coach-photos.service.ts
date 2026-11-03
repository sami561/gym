import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  COACH_PHOTO_ERRORS,
  PHOTO_ERRORS,
  Role,
  SetPhotoRequest,
  StoredPhoto,
  UserDto,
  coachPhotoUrl,
  decodePhotoUpload,
  nextPhotoVersion,
  stripJpegMetadata,
} from '@app/common';
import { UserPhotoEntity } from './user-photo.entity';
import { User } from './user.entity';
import { toUserDto } from './users.service';

/**
 * Coach photos for the website (docs/API.md, Coach photos). The bytes live in user_photos and users.avatarUrl
 * points to their public route (`coachPhotoUrl`, versioned by the upload instant); both change in one
 * transaction that first locks the user row, as every other change of a user does (UsersService), so they
 * never deadlock. The bytes are personal data: never logged, never in an event.
 */
@Injectable()
export class CoachPhotosService {
  constructor(
    @InjectRepository(UserPhotoEntity) private readonly photos: Repository<UserPhotoEntity>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /**
   * The photo the website shows (public route): only for an active COACH. 404 'Aucune photo.' without stored
   * photo, for an unknown id and for a demoted or deactivated coach alike (no way to tell them apart).
   */
  async get(id: string): Promise<StoredPhoto> {
    const photo = id
      ? await this.photos.findOne({ where: { userId: id, user: { role: Role.COACH, isActive: true } } })
      : null;
    if (!photo) throw new NotFoundException(PHOTO_ERRORS.none);
    return { data: photo.data.toString('base64'), contentType: 'image/jpeg', updatedAt: photo.updatedAt.toISOString() };
  }

  /**
   * Replaces the coach's photo with the upload stripped of its metadata (the gateway already limits the size;
   * checked again here) and points avatarUrl to it, with a new `v` at every upload. 400 for another role.
   */
  async set(req: SetPhotoRequest): Promise<UserDto> {
    const jpeg = stripJpegMetadata(decodePhotoUpload(req?.data));
    const user = await this.db.transaction(async (tx) => {
      const locked = await lockUser(tx, req.id);
      if (locked.role !== Role.COACH) throw new BadRequestException(COACH_PHOTO_ERRORS.notCoach);
      const previous = await tx.findOne(UserPhotoEntity, {
        where: { userId: locked.id },
        select: { userId: true, updatedAt: true },
      });
      const at = nextPhotoVersion(previous?.updatedAt, new Date());
      await tx.upsert(UserPhotoEntity, { userId: locked.id, data: jpeg, updatedAt: at }, ['userId']);
      return setAvatarUrl(tx, locked, coachPhotoUrl(locked.id, at));
    });
    return toUserDto(user);
  }

  /** Deletes the stored photo and clears avatarUrl (a URL typed by hand too); answered as it is without photo. */
  async remove(id: string): Promise<UserDto> {
    const user = await this.db.transaction(async (tx) => {
      const locked = await lockUser(tx, id);
      await tx.delete(UserPhotoEntity, { userId: locked.id });
      return locked.avatarUrl === null ? locked : setAvatarUrl(tx, locked, null);
    });
    return toUserDto(user);
  }
}

/** The user row, locked until the end of the transaction (404 when unknown; an empty id matches nobody). */
async function lockUser(tx: EntityManager, id: string): Promise<User> {
  const user = id ? await tx.findOne(User, { where: { id }, lock: { mode: 'pessimistic_write' } }) : null;
  if (!user) throw new NotFoundException('Utilisateur introuvable.');
  return user;
}

/** Only avatarUrl (and updatedAt): the rest of the locked row is answered as it was read. */
async function setAvatarUrl(tx: EntityManager, user: User, avatarUrl: string | null): Promise<User> {
  await tx.update(User, { id: user.id }, { avatarUrl });
  return Object.assign(user, { avatarUrl });
}
