import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository, getMetadataArgsStorage } from 'typeorm';
import { EVENTS, EventBus, MemberStatus, PATTERNS, RpcClient } from '@app/common';
import { Payment } from '../payments/payment.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MemberPhotoEntity } from './member-photo.entity';
import { Member } from './member.entity';
import { MembersService } from './members.service';

const ID = '0b9a2c6e-6f1d-4c39-9a51-3d2f8e7c1a01';

function setup({ exists = true } = {}) {
  const member = Object.assign(new Member(), {
    id: ID,
    memberCode: 'MEL-00042',
    firstName: 'Amira',
    lastName: 'Jaziri',
    email: 'amira.jaziri1@example.com',
    status: MemberStatus.ACTIVE,
    photoUpdatedAt: new Date('2026-11-03T09:00:00.000Z'),
  });
  const steps: string[] = [];
  const tx = {
    findOne: jest.fn(async () => {
      steps.push('lock member');
      return exists ? member : null;
    }),
    delete: jest.fn(async (entity: unknown) => {
      steps.push(entity === MemberPhotoEntity ? 'delete photo' : 'delete member');
      return { affected: exists ? 1 : 0, raw: [] };
    }),
  };
  const db = { transaction: jest.fn(async (work: (manager: typeof tx) => Promise<unknown>) => work(tx)) };
  const members = { findOne: jest.fn(async () => (exists ? member : null)), delete: jest.fn() };
  const rpc = { send: jest.fn().mockResolvedValue({ ok: true }) };
  const events = { publish: jest.fn() };
  const service = new MembersService(
    members as unknown as Repository<Member>,
    {} as Repository<Subscription>,
    {} as Repository<Payment>,
    db as unknown as DataSource,
    {} as SubscriptionsService,
    rpc as unknown as RpcClient,
    events as unknown as EventBus,
  );
  return { service, tx, db, members, rpc, events, steps };
}

describe('MembersService: deleting a member deletes the photo', () => {
  it('DELETE /api/members/:id locks the member, then deletes the photo and the member in one transaction', async () => {
    const { service, tx, db, members, rpc, events, steps } = setup();

    await expect(service.remove(ID)).resolves.toEqual({ ok: true });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(steps).toEqual(['lock member', 'delete photo', 'delete member']);
    expect(tx.findOne).toHaveBeenCalledWith(Member, { where: { id: ID }, lock: { mode: 'pessimistic_write' } });
    expect(tx.delete).toHaveBeenCalledWith(MemberPhotoEntity, { memberId: ID });
    expect(tx.delete).toHaveBeenCalledWith(Member, ID);
    expect(members.delete).not.toHaveBeenCalled();
    expect(rpc.send).toHaveBeenCalledWith(PATTERNS.users.remove, { id: ID });
    expect(events.publish).toHaveBeenCalledWith(EVENTS.memberDeleted, { memberId: ID });
  });

  it('refuses an unknown member before deleting anything', async () => {
    const { service, db } = setup({ exists: false });
    await expect(service.remove(ID)).rejects.toThrow(new NotFoundException('Membre introuvable.'));
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('user.deleted (account deleted in auth-service) deletes the member and the photo too', async () => {
    const { service, events, steps } = setup();
    await service.onUserDeleted(ID);
    expect(steps).toEqual(['lock member', 'delete photo', 'delete member']);
    expect(events.publish).toHaveBeenCalledWith(EVENTS.memberDeleted, { memberId: ID });
  });

  it('user.deleted for an account without member announces nothing', async () => {
    const { service, events, steps } = setup({ exists: false });
    await service.onUserDeleted(ID);
    expect(steps).toEqual(['lock member', 'delete photo']);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('declares the photo with an ON DELETE CASCADE key and keeps photoUpdatedAt out of save()', () => {
    const storage = getMetadataArgsStorage();
    const relation = storage.relations.find((r) => r.target === MemberPhotoEntity && r.propertyName === 'member');
    expect(relation?.options.onDelete).toBe('CASCADE');
    const column = storage.columns.find((c) => c.target === Member && c.propertyName === 'photoUpdatedAt');
    expect(column?.options).toMatchObject({ type: 'timestamptz', nullable: true, insert: false, update: false });
  });
});
