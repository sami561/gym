import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EquipmentCategory, EquipmentStatus } from '@app/common';
import { MaintenanceTicket } from '../maintenance/maintenance-ticket.entity';
import { RoomsService } from '../rooms/rooms.service';
import { Equipment } from './equipment.entity';
import { EquipmentService } from './equipment.service';

function machine(id: string, overrides: Partial<Equipment> = {}): Equipment {
  return Object.assign(new Equipment(), {
    id,
    name: `Machine ${id}`,
    category: EquipmentCategory.STRENGTH,
    brand: null,
    model: null,
    serialNumber: null,
    roomId: null,
    room: null,
    purchaseDate: null,
    purchasePrice: null,
    warrantyUntil: null,
    status: EquipmentStatus.OPERATIONAL,
    maintenanceIntervalDays: 30,
    lastMaintenanceAt: '2026-10-01',
    notes: null,
    ...overrides,
  });
}

function setup({ listed = [] as Equipment[], stored = null as Equipment | null, tickets = 0 } = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoinAndSelect', 'orderBy', 'andWhere']) qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue(listed);
  const equipment = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue(stored),
    create: jest.fn((data: Partial<Equipment>) => Object.assign(new Equipment(), data)),
    save: jest.fn(async (row: Equipment) => Object.assign(row, { id: row.id ?? 'eq-new' })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const ticketRepo = { count: jest.fn().mockResolvedValue(tickets) };
  const rooms = { findOrFail: jest.fn() };
  const service = new EquipmentService(
    equipment as unknown as Repository<Equipment>,
    ticketRepo as unknown as Repository<MaintenanceTicket>,
    rooms as unknown as RoomsService,
  );
  return { service, equipment, qb };
}

describe('EquipmentService', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 10, 2, 9, 0) })); // 2 Nov 2026 in Tunis
  afterEach(() => jest.useRealTimers());

  describe('preventive maintenance due list', () => {
    it('keeps machines due within N days, overdue first, never retired ones', async () => {
      const listed = [
        machine('soon', { lastMaintenanceAt: '2026-10-05' }), // due 2026-11-04
        machine('later', { lastMaintenanceAt: '2026-10-20' }), // due 2026-11-19
        machine('overdue', { lastMaintenanceAt: '2026-09-01' }), // due 2026-10-01
        machine('retired', { lastMaintenanceAt: '2026-09-01', status: EquipmentStatus.RETIRED }),
        machine('unplanned', { maintenanceIntervalDays: null }),
      ];
      const items = await setup({ listed }).service.list({ dueWithinDays: 7 });
      expect(items.map((e) => [e.id, e.nextMaintenanceAt])).toEqual([
        ['overdue', '2026-10-01'],
        ['soon', '2026-11-04'],
      ]);
    });

    it('counts "due today" with 0 days', async () => {
      const items = await setup({ listed: [machine('today', { lastMaintenanceAt: '2026-10-03' })] }).service.list({ dueWithinDays: 0 });
      expect(items.map((e) => e.nextMaintenanceAt)).toEqual(['2026-11-02']);
    });

    it('refuses a negative or fractional horizon', async () => {
      for (const dueWithinDays of [-1, 1.5]) {
        await expect(setup().service.list({ dueWithinDays })).rejects.toThrow(
          new BadRequestException('dueWithinDays doit être un entier positif.'),
        );
      }
    });

    it('hides retired machines unless asked for', async () => {
      const { service, qb } = setup();
      await service.list({});
      expect(qb.andWhere).toHaveBeenCalledWith('"e"."status" <> :retired', { retired: EquipmentStatus.RETIRED });
      await service.list({ status: EquipmentStatus.RETIRED });
      expect(qb.andWhere).toHaveBeenCalledWith('"e"."status" = :status', { status: EquipmentStatus.RETIRED });
    });
  });

  describe('create', () => {
    const request = { name: ' Presse à cuisses ', category: EquipmentCategory.STRENGTH, purchasePrice: 4200.5, maintenanceIntervalDays: 180 };

    it('starts operational with the given schedule', async () => {
      expect(await setup().service.create(request)).toMatchObject({
        name: 'Presse à cuisses',
        status: EquipmentStatus.OPERATIONAL,
        purchasePrice: 4200.5,
        maintenanceIntervalDays: 180,
        nextMaintenanceAt: null,
      });
    });

    it('validates the name, the interval and the serial number', async () => {
      await expect(setup().service.create({ ...request, name: 'x'.repeat(121) })).rejects.toThrow('Nom trop long (120 caractères maximum).');
      for (const maintenanceIntervalDays of [0, 3651, 7.5]) {
        await expect(setup().service.create({ ...request, maintenanceIntervalDays })).rejects.toThrow(
          "L'intervalle de maintenance doit être un nombre de jours entre 1 et 3650.",
        );
      }
      await expect(setup({ stored: machine('other') }).service.create({ ...request, serialNumber: 'SN-1' })).rejects.toThrow(
        new ConflictException('Ce numéro de série existe déjà.'),
      );
    });
  });

  describe('remove', () => {
    it('retires a machine with maintenance history and deletes one without', async () => {
      const withHistory = setup({ stored: machine('eq-1'), tickets: 2 });
      await withHistory.service.remove({ id: 'eq-1' });
      expect(withHistory.equipment.save).toHaveBeenCalledWith(expect.objectContaining({ status: EquipmentStatus.RETIRED }));
      expect(withHistory.equipment.delete).not.toHaveBeenCalled();

      const unused = setup({ stored: machine('eq-2') });
      await unused.service.remove({ id: 'eq-2' });
      expect(unused.equipment.delete).toHaveBeenCalledWith('eq-2');
    });

    it('answers 404 for an unknown machine', async () => {
      await expect(setup().service.remove({ id: 'eq-x' })).rejects.toThrow(new NotFoundException('Équipement introuvable.'));
    });
  });
});
