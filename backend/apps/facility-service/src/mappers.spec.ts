import { EquipmentCategory, EquipmentStatus, LockerStatus, RoomType, TicketPriority, TicketStatus } from '@app/common';
import { Equipment } from './equipment/equipment.entity';
import { Locker } from './lockers/locker.entity';
import { MaintenanceTicket } from './maintenance/maintenance-ticket.entity';
import { Room } from './rooms/room.entity';
import { toEquipmentDto, toLockerDto, toRoomDto, toTicketDto } from './mappers';

const at = new Date('2026-11-02T08:00:00.000Z');
const cardio = Object.assign(new Room(), { id: 'r-1', name: 'Espace cardio', type: RoomType.CARDIO, capacity: 30, floor: null, description: null, isActive: true });

const treadmill = (overrides: Partial<Equipment> = {}): Equipment =>
  Object.assign(new Equipment(), {
    id: 'eq-1',
    name: 'Tapis de course 3',
    category: EquipmentCategory.CARDIO,
    brand: 'Technogym',
    model: 'Run 600',
    serialNumber: 'TG-600-0003',
    roomId: 'r-1',
    room: cardio,
    purchaseDate: '2025-03-01',
    purchasePrice: 9800,
    warrantyUntil: '2027-03-01',
    status: EquipmentStatus.OPERATIONAL,
    maintenanceIntervalDays: 90,
    lastMaintenanceAt: '2026-09-15',
    notes: null,
    ...overrides,
  });

describe('facility mappers', () => {
  it('maps a room with its equipment count', () => {
    expect(toRoomDto(cardio, 12)).toEqual({
      id: 'r-1',
      name: 'Espace cardio',
      type: RoomType.CARDIO,
      capacity: 30,
      floor: null,
      description: null,
      isActive: true,
      equipmentCount: 12,
    });
    expect(toRoomDto(cardio).equipmentCount).toBe(0);
  });

  it('computes the next preventive maintenance of a machine', () => {
    expect(toEquipmentDto(treadmill())).toMatchObject({ roomName: 'Espace cardio', nextMaintenanceAt: '2026-12-14' });
    expect(toEquipmentDto(treadmill({ lastMaintenanceAt: null })).nextMaintenanceAt).toBe('2025-05-30');
    expect(toEquipmentDto(treadmill({ maintenanceIntervalDays: null, room: null })).nextMaintenanceAt).toBeNull();
    expect(toEquipmentDto(treadmill({ room: null })).roomName).toBeNull();
  });

  it('names the room of a ticket from the room, else from the machine', () => {
    const ticket = Object.assign(new MaintenanceTicket(), {
      id: 't-1',
      equipmentId: 'eq-1',
      equipment: treadmill(),
      roomId: null,
      room: null,
      title: 'Bande qui patine',
      description: null,
      priority: TicketPriority.HIGH,
      status: TicketStatus.OPEN,
      reportedByName: 'Sami',
      assignedTo: null,
      cost: null,
      resolution: null,
      openedAt: at,
      resolvedAt: null,
    });
    expect(toTicketDto(ticket)).toMatchObject({ equipmentName: 'Tapis de course 3', roomName: 'Espace cardio', openedAt: '2026-11-02T08:00:00.000Z', resolvedAt: null });
    expect(toTicketDto(Object.assign(new MaintenanceTicket(), ticket, { equipment: null, roomId: 'r-1', room: cardio })).roomName).toBe('Espace cardio');
    expect(toTicketDto(Object.assign(new MaintenanceTicket(), ticket, { equipment: null })).roomName).toBeNull();
  });

  it('maps a locker rental', () => {
    const locker = Object.assign(new Locker(), {
      id: 'l-1',
      number: 'H-12',
      roomId: null,
      room: null,
      status: LockerStatus.OCCUPIED,
      memberId: 'm-1',
      memberName: 'Amira Ben Salah',
      assignedUntil: '2026-12-31',
    });
    expect(toLockerDto(locker)).toEqual({
      id: 'l-1',
      number: 'H-12',
      roomId: null,
      roomName: null,
      status: LockerStatus.OCCUPIED,
      memberId: 'm-1',
      memberName: 'Amira Ben Salah',
      assignedUntil: '2026-12-31',
    });
  });
});
