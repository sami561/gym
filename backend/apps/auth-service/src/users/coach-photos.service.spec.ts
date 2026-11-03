import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { PHOTO_MAX_BYTES, Role } from '@app/common';
import { GPS_LATITUDE, PNG, cameraJpeg, cleanJpeg, jpegOfSize } from '@app/common/utils/jpeg-samples';
import { CoachPhotosService } from './coach-photos.service';
import { UserPhotoEntity } from './user-photo.entity';
import { User } from './user.entity';

const NOW = new Date('2026-11-03T09:00:00.000Z');
const ID = '3c5e8a52-4f0e-4c1e-9b7a-0a1b2c3d4e05';
const URL_NOW = `/api/public/coaches/${ID}/photo?v=${NOW.getTime()}`;
const MISSING = new BadRequestException('Ajoutez une photo (champ « photo »).');
const NOT_JPEG = new BadRequestException('La photo doit être une image JPEG.');
const TOO_LARGE = new PayloadTooLargeException('La photo dépasse 512 Ko.');
const NOT_COACH = new BadRequestException('Seuls les coachs ont une photo sur le site.');
const UNKNOWN = new NotFoundException('Utilisateur introuvable.');
const NONE = new NotFoundException('Aucune photo.');

const user = (patch: Partial<User> = {}): User =>
  Object.assign(new User(), {
    id: ID,
    email: 'coach1@example.com',
    phone: null,
    passwordHash: 'hash',
    role: Role.COACH,
    firstName: 'Leila',
    lastName: 'Ayari',
    avatarUrl: null,
    specialty: 'Yoga',
    bio: null,
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...patch,
  });

type Where = { userId?: string; id?: string; user?: { role: Role; isActive: boolean } };

/** users and user_photos kept in memory, behind the calls the service makes. */
function setup(initial: { user?: User | null; photo?: UserPhotoEntity | null } = {}) {
  const db = {
    user: initial.user === undefined ? user() : initial.user,
    photo: initial.photo ?? null,
  };
  const tx = {
    findOne: jest.fn(async (entity: unknown, options: { where: Where }) => {
      if (entity === User) return db.user && options.where.id === db.user.id ? Object.assign(new User(), db.user) : null;
      return db.photo && options.where.userId === db.photo.userId ? { userId: db.photo.userId, updatedAt: db.photo.updatedAt } : null;
    }),
    upsert: jest.fn(async (_entity: unknown, row: Partial<UserPhotoEntity>) => {
      db.photo = Object.assign(new UserPhotoEntity(), row);
    }),
    delete: jest.fn(async () => {
      db.photo = null;
      return { affected: 1, raw: [] };
    }),
    update: jest.fn(async (_entity: unknown, where: { id: string }, values: Partial<User>) => {
      if (db.user?.id === where.id) Object.assign(db.user, values);
    }),
  };
  const dataSource = { transaction: jest.fn(async (work: (manager: typeof tx) => Promise<unknown>) => work(tx)) };
  const photos = {
    // The relation condition, as Postgres would apply it.
    findOne: jest.fn(async ({ where }: { where: Where }) => {
      const owner = db.user;
      const visible = owner && owner.id === where.userId && owner.role === where.user?.role && owner.isActive === where.user?.isActive;
      return visible && db.photo?.userId === where.userId ? db.photo : null;
    }),
  };
  const service = new CoachPhotosService(
    photos as unknown as Repository<UserPhotoEntity>,
    dataSource as unknown as DataSource,
  );
  return { service, db, tx, dataSource, photos };
}

const base64 = (bytes: Buffer) => bytes.toString('base64');

describe('CoachPhotosService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('set', () => {
    it('stores the JPEG without its EXIF (GPS) and comment segments and points avatarUrl to the public route', async () => {
      const { service, db, tx } = setup({ user: user({ avatarUrl: 'https://cdn.example.com/old.jpg' }) });

      const dto = await service.set({ id: ID, data: base64(cameraJpeg()) });

      expect(db.photo?.data).toEqual(cleanJpeg());
      expect(db.photo?.data.includes(GPS_LATITUDE)).toBe(false);
      expect(db.photo?.updatedAt).toEqual(NOW);
      expect(db.user?.avatarUrl).toBe(URL_NOW);
      expect(dto).toMatchObject({ id: ID, role: Role.COACH, avatarUrl: URL_NOW, specialty: 'Yoga' });
      expect(dto).not.toHaveProperty('passwordHash');
      // The user row is locked first; the photo and avatarUrl (only that column) change in the same transaction.
      expect(tx.findOne).toHaveBeenNthCalledWith(1, User, { where: { id: ID }, lock: { mode: 'pessimistic_write' } });
      expect(tx.upsert).toHaveBeenCalledWith(UserPhotoEntity, expect.objectContaining({ userId: ID }), ['userId']);
      expect(tx.update).toHaveBeenCalledWith(User, { id: ID }, { avatarUrl: URL_NOW });
    });

    it('gives every upload a new version, even within the same millisecond', async () => {
      const { service, db } = setup();
      const first = await service.set({ id: ID, data: base64(cameraJpeg()) });
      const second = await service.set({ id: ID, data: base64(cleanJpeg()) });
      expect(first.avatarUrl).toBe(URL_NOW);
      expect(second.avatarUrl).toBe(`/api/public/coaches/${ID}/photo?v=${NOW.getTime() + 1}`);
      expect(db.photo?.updatedAt.getTime()).toBe(NOW.getTime() + 1);

      jest.setSystemTime(new Date('2026-11-03T09:05:00.000Z'));
      const later = await service.set({ id: ID, data: base64(cleanJpeg()) });
      expect(later.avatarUrl).toBe(`/api/public/coaches/${ID}/photo?v=${Date.parse('2026-11-03T09:05:00.000Z')}`);
    });

    it('only for a coach: 400 for an ADMIN, STAFF or MEMBER account, nothing written', async () => {
      for (const role of [Role.ADMIN, Role.STAFF, Role.MEMBER]) {
        const { service, db, tx } = setup({ user: user({ role, avatarUrl: 'https://cdn.example.com/a.jpg' }) });
        await expect(service.set({ id: ID, data: base64(cameraJpeg()) })).rejects.toThrow(NOT_COACH);
        expect(tx.upsert).not.toHaveBeenCalled();
        expect(tx.update).not.toHaveBeenCalled();
        expect(db.user?.avatarUrl).toBe('https://cdn.example.com/a.jpg');
      }
    });

    it('accepts a deactivated coach (the website shows the photo again once reactivated)', async () => {
      const { service, db } = setup({ user: user({ isActive: false }) });
      await expect(service.set({ id: ID, data: base64(cameraJpeg()) })).resolves.toMatchObject({ avatarUrl: URL_NOW });
      expect(db.photo).not.toBeNull();
    });

    it('404 Utilisateur introuvable for an unknown or missing id', async () => {
      const unknown = setup({ user: null });
      await expect(unknown.service.set({ id: ID, data: base64(cameraJpeg()) })).rejects.toThrow(UNKNOWN);
      expect(unknown.tx.upsert).not.toHaveBeenCalled();

      const missing = setup();
      await expect(missing.service.set({ id: '', data: base64(cameraJpeg()) })).rejects.toThrow(UNKNOWN);
      expect(missing.tx.findOne).not.toHaveBeenCalled();
    });

    it('accepts 512 KB exactly and refuses one byte more, before touching the database', async () => {
      const { service, db, dataSource } = setup();
      await service.set({ id: ID, data: base64(jpegOfSize(PHOTO_MAX_BYTES)) });
      expect(db.photo?.data).toEqual(cleanJpeg());

      dataSource.transaction.mockClear();
      await expect(service.set({ id: ID, data: base64(jpegOfSize(PHOTO_MAX_BYTES + 1)) })).rejects.toThrow(TOO_LARGE);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses a missing upload and what is not a JPEG, before touching the database', async () => {
      const { service, db, dataSource } = setup();
      await expect(service.set({ id: ID, data: '' })).rejects.toThrow(MISSING);
      await expect(service.set({ id: ID } as never)).rejects.toThrow(MISSING);
      await expect(service.set(undefined as never)).rejects.toThrow(MISSING);
      await expect(service.set({ id: ID, data: base64(PNG) })).rejects.toThrow(NOT_JPEG);
      await expect(service.set({ id: ID, data: base64(cameraJpeg().subarray(0, 300)) })).rejects.toThrow(NOT_JPEG);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(db.photo).toBeNull();
    });
  });

  describe('get (public route)', () => {
    it('returns the stored (cleaned) JPEG of an active coach, asking only for active coaches', async () => {
      const { service, photos } = setup();
      await service.set({ id: ID, data: base64(cameraJpeg()) });
      await expect(service.get(ID)).resolves.toEqual({
        data: base64(cleanJpeg()),
        contentType: 'image/jpeg',
        updatedAt: NOW.toISOString(),
      });
      expect(photos.findOne).toHaveBeenCalledWith({ where: { userId: ID, user: { role: Role.COACH, isActive: true } } });
    });

    it('404 Aucune photo without photo, for an unknown or missing id, and once the coach is demoted or deactivated', async () => {
      await expect(setup().service.get(ID)).rejects.toThrow(NONE);
      await expect(setup({ user: null }).service.get(ID)).rejects.toThrow(NONE);
      const missing = setup();
      await expect(missing.service.get('')).rejects.toThrow(NONE);
      expect(missing.photos.findOne).not.toHaveBeenCalled();

      for (const change of [{ role: Role.STAFF }, { isActive: false }]) {
        const { service, db } = setup();
        await service.set({ id: ID, data: base64(cameraJpeg()) });
        Object.assign(db.user!, change);
        await expect(service.get(ID)).rejects.toThrow(NONE);
        expect(db.photo).not.toBeNull();
      }
    });
  });

  describe('remove', () => {
    it('deletes the photo and clears avatarUrl', async () => {
      const { service, db, tx } = setup();
      await service.set({ id: ID, data: base64(cameraJpeg()) });

      const dto = await service.remove(ID);

      expect(dto).toMatchObject({ id: ID, avatarUrl: null });
      expect(db.photo).toBeNull();
      expect(db.user?.avatarUrl).toBeNull();
      expect(tx.delete).toHaveBeenCalledWith(UserPhotoEntity, { userId: ID });
      await expect(service.get(ID)).rejects.toThrow(NONE);
    });

    it('also clears a URL typed by hand; a user without photo is answered as it is', async () => {
      const typed = setup({ user: user({ avatarUrl: 'https://cdn.example.com/a.jpg' }) });
      await expect(typed.service.remove(ID)).resolves.toMatchObject({ avatarUrl: null });
      expect(typed.db.user?.avatarUrl).toBeNull();

      const none = setup();
      await expect(none.service.remove(ID)).resolves.toMatchObject({ id: ID, avatarUrl: null });
      expect(none.tx.update).not.toHaveBeenCalled();
    });

    it('works for any role (a demoted coach), 404 for an unknown user', async () => {
      const staff = setup({ user: user({ role: Role.STAFF, avatarUrl: URL_NOW }) });
      await expect(staff.service.remove(ID)).resolves.toMatchObject({ role: Role.STAFF, avatarUrl: null });
      await expect(setup({ user: null }).service.remove(ID)).rejects.toThrow(UNKNOWN);
    });
  });
});
