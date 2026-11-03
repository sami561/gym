import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { MEMBER_PHOTO_MAX_BYTES, MemberStatus } from '@app/common';
import { Member } from './member.entity';
import { MemberPhotoEntity } from './member-photo.entity';
import { MemberPhotosService, decodeUpload, nextPhotoVersion } from './member-photos.service';
import { GPS_LATITUDE, PNG, cameraJpeg, cleanJpeg, segment } from './jpeg-samples';

const NOW = new Date('2026-11-03T09:00:00.000Z');
const ID = '0b9a2c6e-6f1d-4c39-9a51-3d2f8e7c1a01';
const MISSING = new BadRequestException('Ajoutez une photo (champ « photo »).');
const NOT_JPEG = new BadRequestException('La photo doit être une image JPEG.');
const TOO_LARGE = new PayloadTooLargeException('La photo dépasse 512 Ko.');

const member = (photoUpdatedAt: Date | null = null): Member =>
  Object.assign(new Member(), {
    id: ID,
    memberCode: 'MEL-00042',
    firstName: 'Amira',
    lastName: 'Jaziri',
    email: 'amira.jaziri1@example.com',
    phone: null,
    birthDate: null,
    gender: null,
    emergencyContact: null,
    notes: null,
    status: MemberStatus.ACTIVE,
    joinedAt: new Date('2026-01-10T08:00:00.000Z'),
    updatedAt: new Date('2026-01-10T08:00:00.000Z'),
    photoUpdatedAt,
  });

/** members.photoUpdatedAt and member_photos kept in memory, behind the calls the service makes. */
function setup(initial: { member?: Member | null; photo?: MemberPhotoEntity | null } = {}) {
  const db = {
    member: initial.member === undefined ? member() : initial.member,
    photo: initial.photo ?? null,
  };
  const tx = {
    findOne: jest.fn(async (_entity: unknown, options: { where: { id: string } }) =>
      db.member && options.where.id === db.member.id ? Object.assign(new Member(), db.member) : null,
    ),
    upsert: jest.fn(async (_entity: unknown, row: Partial<MemberPhotoEntity>) => {
      db.photo = Object.assign(new MemberPhotoEntity(), row);
    }),
    delete: jest.fn(async () => {
      db.photo = null;
      return { affected: 1, raw: [] };
    }),
    query: jest.fn(async (_sql: string, [id, at]: [string, Date | null]) => {
      if (db.member?.id === id) db.member.photoUpdatedAt = at;
    }),
  };
  const dataSource = { transaction: jest.fn(async (work: (manager: typeof tx) => Promise<unknown>) => work(tx)) };
  const photos = { findOne: jest.fn(async () => db.photo) };
  const members = { existsBy: jest.fn(async () => db.member !== null) };
  const service = new MemberPhotosService(
    photos as unknown as Repository<MemberPhotoEntity>,
    members as unknown as Repository<Member>,
    dataSource as unknown as DataSource,
  );
  return { service, db, tx, dataSource, photos, members };
}

const base64 = (bytes: Buffer) => bytes.toString('base64');

/** A valid JPEG of exactly `size` bytes: cameraJpeg() padded with comment segments (removed on upload). */
function jpegOfSize(size: number): Buffer {
  const jpeg = cameraJpeg();
  const room = size - jpeg.length;
  const count = Math.ceil(room / 0xfff0);
  const sizes = Array.from({ length: count }, (_, i) => Math.floor(room / count) + (i < room % count ? 1 : 0));
  const padding = sizes.map((bytes) => segment(0xfe, Buffer.alloc(bytes - 4, 0x20)));
  return Buffer.concat([jpeg.subarray(0, 2), ...padding, jpeg.subarray(2)]);
}

describe('MemberPhotosService', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  describe('set', () => {
    it('stores the JPEG without its EXIF (GPS) and comment segments, and dates the member photo', async () => {
      const { service, db, tx } = setup();

      const dto = await service.set({ id: ID, data: base64(cameraJpeg()) });

      expect(db.photo?.data).toEqual(cleanJpeg());
      expect(db.photo?.data.includes(GPS_LATITUDE)).toBe(false);
      expect(db.photo?.updatedAt).toEqual(NOW);
      expect(db.member?.photoUpdatedAt).toEqual(NOW);
      expect(dto).toMatchObject({ id: ID, memberCode: 'MEL-00042', photoUpdatedAt: NOW.toISOString() });
      // The member row is locked first, then the photo and the column change in the same transaction.
      expect(tx.findOne).toHaveBeenCalledWith(Member, { where: { id: ID }, lock: { mode: 'pessimistic_write' } });
      expect(tx.upsert).toHaveBeenCalledWith(MemberPhotoEntity, expect.objectContaining({ memberId: ID }), ['memberId']);
      expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('SET "photoUpdatedAt" = $2'), [ID, NOW]);
    });

    it('gives every upload a new photoUpdatedAt, even within the same millisecond', async () => {
      const { service, db } = setup({ member: member(NOW) });
      const first = await service.set({ id: ID, data: base64(cameraJpeg()) });
      const second = await service.set({ id: ID, data: base64(cleanJpeg()) });
      expect(first.photoUpdatedAt).toBe('2026-11-03T09:00:00.001Z');
      expect(second.photoUpdatedAt).toBe('2026-11-03T09:00:00.002Z');
      expect(db.photo?.updatedAt.toISOString()).toBe(second.photoUpdatedAt);

      jest.setSystemTime(new Date('2026-11-03T09:05:00.000Z'));
      expect((await service.set({ id: ID, data: base64(cleanJpeg()) })).photoUpdatedAt).toBe('2026-11-03T09:05:00.000Z');
    });

    it('accepts 512 KB exactly and refuses one byte more, before touching the database', async () => {
      const { service, db, dataSource } = setup();
      const limit = jpegOfSize(MEMBER_PHOTO_MAX_BYTES);
      expect(limit.length).toBe(MEMBER_PHOTO_MAX_BYTES);
      await service.set({ id: ID, data: base64(limit) });
      expect(db.photo?.data).toEqual(cleanJpeg());

      dataSource.transaction.mockClear();
      await expect(service.set({ id: ID, data: base64(jpegOfSize(MEMBER_PHOTO_MAX_BYTES + 1)) })).rejects.toThrow(TOO_LARGE);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses a missing upload and what is not a JPEG', async () => {
      const { service, db, dataSource } = setup();
      await expect(service.set({ id: ID, data: '' })).rejects.toThrow(MISSING);
      await expect(service.set({ id: ID } as never)).rejects.toThrow(MISSING);
      await expect(service.set({ id: ID, data: base64(PNG) })).rejects.toThrow(NOT_JPEG);
      await expect(service.set({ id: ID, data: base64(Buffer.from('<?php echo 1; ?>')) })).rejects.toThrow(NOT_JPEG);
      await expect(service.set({ id: ID, data: base64(cameraJpeg().subarray(0, 300)) })).rejects.toThrow(NOT_JPEG);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(db.photo).toBeNull();
    });

    it('refuses an unknown member', async () => {
      const { service, tx } = setup({ member: null });
      await expect(service.set({ id: ID, data: base64(cameraJpeg()) })).rejects.toThrow(
        new NotFoundException('Membre introuvable.'),
      );
      expect(tx.upsert).not.toHaveBeenCalled();
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns the stored (cleaned) JPEG in base64 with the version of photoUpdatedAt', async () => {
      const { service } = setup();
      const dto = await service.set({ id: ID, data: base64(cameraJpeg()) });
      const photo = await service.get(ID);
      expect(photo).toEqual({ data: base64(cleanJpeg()), contentType: 'image/jpeg', updatedAt: dto.photoUpdatedAt });
    });

    it('answers 404 Aucune photo for a member without photo, Membre introuvable for an unknown id', async () => {
      await expect(setup().service.get(ID)).rejects.toThrow(new NotFoundException('Aucune photo.'));
      await expect(setup({ member: null }).service.get(ID)).rejects.toThrow(new NotFoundException('Membre introuvable.'));
      await expect(setup().service.get('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes the photo and clears photoUpdatedAt', async () => {
      const { service, db, tx } = setup();
      await service.set({ id: ID, data: base64(cameraJpeg()) });

      const dto = await service.remove(ID);

      expect(dto).toMatchObject({ id: ID, photoUpdatedAt: null });
      expect(db.photo).toBeNull();
      expect(db.member?.photoUpdatedAt).toBeNull();
      expect(tx.delete).toHaveBeenCalledWith(MemberPhotoEntity, { memberId: ID });
      await expect(service.get(ID)).rejects.toThrow(new NotFoundException('Aucune photo.'));
    });

    it('answers a member without photo as it is, and 404 for an unknown member', async () => {
      await expect(setup().service.remove(ID)).resolves.toMatchObject({ id: ID, photoUpdatedAt: null });
      await expect(setup({ member: null }).service.remove(ID)).rejects.toThrow(new NotFoundException('Membre introuvable.'));
    });
  });

  describe('decodeUpload', () => {
    it('refuses base64 text longer than 512 KB of data without decoding it', () => {
      const tooLong = 'A'.repeat(Math.ceil(MEMBER_PHOTO_MAX_BYTES / 3) * 4 + 4);
      const from = jest.spyOn(Buffer, 'from');
      expect(() => decodeUpload(tooLong)).toThrow(TOO_LARGE);
      expect(from).not.toHaveBeenCalled();
      from.mockRestore();
    });

    it('refuses what is not text', () => {
      for (const data of [undefined, null, 42, { photo: 'x' }, '']) expect(() => decodeUpload(data)).toThrow(MISSING);
    });
  });

  it('nextPhotoVersion moves past the previous version', () => {
    expect(nextPhotoVersion(null, NOW)).toBe(NOW);
    expect(nextPhotoVersion(new Date('2026-11-03T08:00:00.000Z'), NOW)).toBe(NOW);
    expect(nextPhotoVersion(NOW, NOW).toISOString()).toBe('2026-11-03T09:00:00.001Z');
    expect(nextPhotoVersion(new Date('2026-11-03T09:00:10.000Z'), NOW).toISOString()).toBe('2026-11-03T09:00:10.001Z');
  });
});
