import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { EquipmentStatus, FacilityStats, LockerStatus, TicketPriority, TicketStatus } from '@app/common';
import { Equipment } from '../equipment/equipment.entity';
import { isMaintenanceDue, nextMaintenanceAt } from '../equipment/maintenance-schedule';
import { Locker } from '../lockers/locker.entity';
import { MaintenanceTicket } from '../maintenance/maintenance-ticket.entity';
import { Room } from '../rooms/room.entity';

/** Preventive maintenance counted as "due" when planned within this many days (or overdue). */
const MAINTENANCE_DUE_DAYS = 7;

@Injectable()
export class FacilityStatsService {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(Equipment) private readonly equipment: Repository<Equipment>,
    @InjectRepository(MaintenanceTicket) private readonly tickets: Repository<MaintenanceTicket>,
    @InjectRepository(Locker) private readonly lockers: Repository<Locker>,
  ) {}

  async summary(): Promise<FacilityStats> {
    const [rooms, inService, openTickets, urgentTickets, lockersFree, lockersOccupied] = await Promise.all([
      this.rooms.count({ where: { isActive: true } }),
      this.equipment.find({
        where: { status: Not(EquipmentStatus.RETIRED) },
        select: { id: true, status: true, lastMaintenanceAt: true, purchaseDate: true, maintenanceIntervalDays: true },
      }),
      this.tickets.count({ where: { status: Not(TicketStatus.RESOLVED) } }),
      this.tickets.count({ where: { status: Not(TicketStatus.RESOLVED), priority: TicketPriority.URGENT } }),
      this.lockers.count({ where: { status: LockerStatus.FREE } }),
      this.lockers.count({ where: { status: LockerStatus.OCCUPIED } }),
    ]);
    const unavailable = [EquipmentStatus.OUT_OF_ORDER, EquipmentStatus.MAINTENANCE];
    return {
      rooms,
      equipmentTotal: inService.length,
      // Machines members cannot use right now (broken or in maintenance).
      equipmentOutOfOrder: inService.filter((e) => unavailable.includes(e.status)).length,
      maintenanceDue: inService.filter((e) => isMaintenanceDue(nextMaintenanceAt(e), MAINTENANCE_DUE_DAYS)).length,
      openTickets,
      urgentTickets,
      lockersFree,
      lockersOccupied,
    };
  }
}
