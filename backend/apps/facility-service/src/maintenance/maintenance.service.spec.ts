import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EVENTS, EquipmentCategory, EquipmentStatus, EventBus, TicketPriority, TicketStatus } from '@app/common';
import { Equipment } from '../equipment/equipment.entity';
import { EquipmentService } from '../equipment/equipment.service';
import { RoomsService } from '../rooms/rooms.service';
import { MaintenanceService, isSerious } from './maintenance.service';
import { MaintenanceTicket } from './maintenance-ticket.entity';

const NOW = new Date('2026-11-02T08:00:00.000Z');

const treadmill = (status = EquipmentStatus.OPERATIONAL): Equipment =>
  Object.assign(new Equipment(), {
    id: 'eq-1',
    name: 'Tapis de course 3',
    category: EquipmentCategory.CARDIO,
    roomId: null,
    room: null,
    status,
    maintenanceIntervalDays: 90,
    lastMaintenanceAt: '2026-08-01',
  });

function ticket(overrides: Partial<MaintenanceTicket> = {}): MaintenanceTicket {
  return Object.assign(new MaintenanceTicket(), {
    id: 't-1',
    equipmentId: 'eq-1',
    equipment: treadmill(),
    roomId: null,
    room: null,
    title: 'Bande qui patine',
    description: null,
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    reportedByName: 'Sami',
    assignedTo: null,
    cost: null,
    resolution: null,
    openedAt: new Date('2026-11-01T08:00:00.000Z'),
    resolvedAt: null,
    ...overrides,
  });
}

function setup({ stored = null as MaintenanceTicket | null, listed = [] as MaintenanceTicket[], machine = treadmill() } = {}) {
  const tickets = {
    find: jest.fn().mockResolvedValue(listed),
    findOne: jest.fn().mockResolvedValue(stored),
    create: jest.fn((data: Partial<MaintenanceTicket>) => Object.assign(new MaintenanceTicket(), data)),
    save: jest.fn(async (row: MaintenanceTicket) => Object.assign(row, { id: row.id ?? 't-new', openedAt: row.openedAt ?? NOW })),
  };
  const equipmentRepo = { save: jest.fn(async (row: Equipment) => row) };
  const equipment = { findOrFail: jest.fn().mockResolvedValue(machine) };
  const rooms = { findOrFail: jest.fn() };
  const events = { publish: jest.fn() };
  const service = new MaintenanceService(
    tickets as unknown as Repository<MaintenanceTicket>,
    equipmentRepo as unknown as Repository<Equipment>,
    equipment as unknown as EquipmentService,
    rooms as unknown as RoomsService,
    events as unknown as EventBus,
  );
  return { service, tickets, equipmentRepo, events, machine };
}

describe('MaintenanceService (tickets)', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('treats HIGH and URGENT as serious', () => {
    expect([TicketPriority.LOW, TicketPriority.MEDIUM, TicketPriority.HIGH, TicketPriority.URGENT].map(isSerious)).toEqual([false, false, true, true]);
  });

  it('lists open tickets by urgency then newest, resolved ones last by date', async () => {
    const day = (d: number) => new Date(Date.UTC(2026, 10, d));
    const listed = [
      ticket({ id: 'low-new', priority: TicketPriority.LOW, openedAt: day(5) }),
      ticket({ id: 'resolved-urgent', priority: TicketPriority.URGENT, status: TicketStatus.RESOLVED, openedAt: day(1) }),
      ticket({ id: 'urgent', priority: TicketPriority.URGENT, status: TicketStatus.IN_PROGRESS, openedAt: day(2) }),
      ticket({ id: 'resolved-low', priority: TicketPriority.LOW, status: TicketStatus.RESOLVED, openedAt: day(3) }),
      ticket({ id: 'high-old', priority: TicketPriority.HIGH, openedAt: day(1) }),
      ticket({ id: 'high-new', priority: TicketPriority.HIGH, openedAt: day(4) }),
    ];
    const ids = (await setup({ listed }).service.list({})).map((t) => t.id);
    expect(ids).toEqual(['urgent', 'high-new', 'high-old', 'low-new', 'resolved-low', 'resolved-urgent']);
  });

  describe('create', () => {
    it('takes an operational machine out of service and alerts on a serious problem', async () => {
      const { service, equipmentRepo, events, machine } = setup();
      const dto = await service.create({ equipmentId: 'eq-1', title: ' Moteur HS ', priority: TicketPriority.URGENT, reportedByName: 'Sami' });
      expect(dto).toMatchObject({ title: 'Moteur HS', status: TicketStatus.OPEN, equipmentName: 'Tapis de course 3' });
      expect(machine.status).toBe(EquipmentStatus.MAINTENANCE);
      expect(equipmentRepo.save).toHaveBeenCalledWith(machine);
      expect(events.publish).toHaveBeenCalledWith(EVENTS.maintenanceOpened, {
        ticketId: 't-new',
        title: 'Moteur HS',
        priority: TicketPriority.URGENT,
        equipmentName: 'Tapis de course 3',
        roomName: null,
        cost: null,
        at: NOW.toISOString(),
      });
    });

    it('alerts without changing a machine already out of order', async () => {
      const { service, equipmentRepo, events } = setup({ machine: treadmill(EquipmentStatus.OUT_OF_ORDER) });
      await service.create({ equipmentId: 'eq-1', title: 'Écran cassé', priority: TicketPriority.HIGH });
      expect(equipmentRepo.save).not.toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalledTimes(1);
    });

    it('records a minor problem quietly', async () => {
      const { service, equipmentRepo, events } = setup();
      await service.create({ equipmentId: 'eq-1', title: 'Grincement', priority: TicketPriority.LOW });
      expect(equipmentRepo.save).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('validates the priority and the title', async () => {
      const { service } = setup();
      await expect(service.create({ title: 'Fuite', priority: 'CRITICAL' as TicketPriority })).rejects.toThrow('Priorité invalide.');
      await expect(service.create({ title: '  ', priority: TicketPriority.LOW })).rejects.toThrow('Le titre est obligatoire.');
      await expect(service.create({ title: 'x'.repeat(161), priority: TicketPriority.LOW })).rejects.toThrow(
        new BadRequestException('Titre trop long (160 caractères maximum).'),
      );
    });
  });

  describe('update', () => {
    it('puts the machine back in service when the ticket is resolved, once', async () => {
      const stored = ticket({ equipment: treadmill(EquipmentStatus.MAINTENANCE), priority: TicketPriority.HIGH });
      const { service, equipmentRepo, events } = setup({ stored });
      const dto = await service.update({ id: 't-1', data: { status: TicketStatus.RESOLVED, cost: 85.5, resolution: 'Courroie changée' } });

      expect(dto).toMatchObject({ status: TicketStatus.RESOLVED, cost: 85.5, resolvedAt: NOW.toISOString() });
      expect(equipmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: EquipmentStatus.OPERATIONAL, lastMaintenanceAt: '2026-11-02' }));
      expect(events.publish).toHaveBeenCalledWith(EVENTS.maintenanceResolved, expect.objectContaining({ ticketId: 't-1', cost: 85.5, at: NOW.toISOString() }));
    });

    it('keeps a retired machine retired when its ticket is resolved', async () => {
      const { service, equipmentRepo } = setup({ stored: ticket({ equipment: treadmill(EquipmentStatus.RETIRED) }) });
      await service.update({ id: 't-1', data: { status: TicketStatus.RESOLVED } });
      expect(equipmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: EquipmentStatus.RETIRED, lastMaintenanceAt: '2026-11-02' }));
    });

    it('clears the resolution date when a ticket is reopened', async () => {
      const { service, events } = setup({ stored: ticket({ status: TicketStatus.RESOLVED, resolvedAt: new Date('2026-11-01T10:00:00.000Z') }) });
      expect((await service.update({ id: 't-1', data: { status: TicketStatus.OPEN } })).resolvedAt).toBeNull();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('escalates when an open ticket becomes serious, not when it already was', async () => {
      const raised = setup({ stored: ticket({ priority: TicketPriority.LOW }) });
      await raised.service.update({ id: 't-1', data: { priority: TicketPriority.URGENT } });
      expect(raised.events.publish).toHaveBeenCalledWith(EVENTS.maintenanceOpened, expect.objectContaining({ priority: TicketPriority.URGENT }));

      const already = setup({ stored: ticket({ priority: TicketPriority.HIGH }) });
      await already.service.update({ id: 't-1', data: { priority: TicketPriority.URGENT } });
      expect(already.events.publish).not.toHaveBeenCalled();
    });

    it('validates the cost and answers 404 for an unknown ticket', async () => {
      await expect(setup({ stored: ticket() }).service.update({ id: 't-1', data: { cost: -5 } })).rejects.toThrow(
        'Le coût doit être un nombre positif ou nul.',
      );
      await expect(setup().service.update({ id: 't-x', data: {} })).rejects.toThrow(new NotFoundException('Ticket de maintenance introuvable.'));
    });
  });
});
