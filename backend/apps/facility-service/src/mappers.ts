import { EquipmentDto, LockerDto, MaintenanceTicketDto, RoomDto } from '@app/common';
import { Equipment } from './equipment/equipment.entity';
import { nextMaintenanceAt } from './equipment/maintenance-schedule';
import { Locker } from './lockers/locker.entity';
import { MaintenanceTicket } from './maintenance/maintenance-ticket.entity';
import { Room } from './rooms/room.entity';

export function toRoomDto(room: Room, equipmentCount = 0): RoomDto {
  return {
    id: room.id,
    name: room.name,
    type: room.type,
    capacity: room.capacity,
    floor: room.floor,
    description: room.description,
    isActive: room.isActive,
    equipmentCount,
  };
}

export function toEquipmentDto(e: Equipment): EquipmentDto {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    brand: e.brand,
    model: e.model,
    serialNumber: e.serialNumber,
    roomId: e.roomId,
    roomName: e.room?.name ?? null,
    purchaseDate: e.purchaseDate,
    purchasePrice: e.purchasePrice,
    warrantyUntil: e.warrantyUntil,
    status: e.status,
    maintenanceIntervalDays: e.maintenanceIntervalDays,
    lastMaintenanceAt: e.lastMaintenanceAt,
    nextMaintenanceAt: nextMaintenanceAt(e),
    notes: e.notes,
  };
}

export function toTicketDto(t: MaintenanceTicket): MaintenanceTicketDto {
  return {
    id: t.id,
    equipmentId: t.equipmentId,
    equipmentName: t.equipment?.name ?? null,
    roomId: t.roomId,
    roomName: t.room?.name ?? t.equipment?.room?.name ?? null,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    reportedByName: t.reportedByName,
    assignedTo: t.assignedTo,
    cost: t.cost,
    openedAt: t.openedAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    resolution: t.resolution,
  };
}

export function toLockerDto(l: Locker): LockerDto {
  return {
    id: l.id,
    number: l.number,
    roomId: l.roomId,
    roomName: l.room?.name ?? null,
    status: l.status,
    memberId: l.memberId,
    memberName: l.memberName,
    assignedUntil: l.assignedUntil,
  };
}
