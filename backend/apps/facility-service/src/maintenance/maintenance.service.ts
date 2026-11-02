import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateTicketRequest,
  EVENTS,
  EquipmentStatus,
  EventBus,
  ListTicketsRequest,
  MaintenanceEvent,
  MaintenanceTicketDto,
  TicketPriority,
  TicketStatus,
  UpdateTicketRequest,
  toDateOnly,
} from '@app/common';
import { Equipment } from '../equipment/equipment.entity';
import { EquipmentService } from '../equipment/equipment.service';
import { toTicketDto } from '../mappers';
import { RoomsService } from '../rooms/rooms.service';
import { amount, oneOf, optionalText, requiredText } from '../shared/inputs';
import { MaintenanceTicket } from './maintenance-ticket.entity';

const PRIORITY_RANK: Record<TicketPriority, number> = {
  [TicketPriority.URGENT]: 0,
  [TicketPriority.HIGH]: 1,
  [TicketPriority.MEDIUM]: 2,
  [TicketPriority.LOW]: 3,
};

/** HIGH / URGENT tickets take the machine out of service and alert the owner. */
export function isSerious(priority: TicketPriority): boolean {
  return priority === TicketPriority.HIGH || priority === TicketPriority.URGENT;
}

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceTicket) private readonly tickets: Repository<MaintenanceTicket>,
    @InjectRepository(Equipment) private readonly equipmentRepo: Repository<Equipment>,
    private readonly equipment: EquipmentService,
    private readonly rooms: RoomsService,
    private readonly events: EventBus,
  ) {}

  /** Open tickets first (most urgent, then newest), resolved ones after. */
  async list(request: ListTicketsRequest): Promise<MaintenanceTicketDto[]> {
    const tickets = await this.tickets.find({
      where: {
        ...(request.status ? { status: request.status } : {}),
        ...(request.equipmentId ? { equipmentId: request.equipmentId } : {}),
        ...(request.roomId ? { roomId: request.roomId } : {}),
      },
      relations: { equipment: { room: true }, room: true },
      order: { openedAt: 'DESC' },
      take: 500,
    });
    const resolvedLast = (t: MaintenanceTicket) => (t.status === TicketStatus.RESOLVED ? 1 : 0);
    return tickets
      .sort(
        (a, b) =>
          resolvedLast(a) - resolvedLast(b) ||
          (resolvedLast(a) ? 0 : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) ||
          b.openedAt.getTime() - a.openedAt.getTime(),
      )
      .map(toTicketDto);
  }

  async create(request: CreateTicketRequest): Promise<MaintenanceTicketDto> {
    const equipment = request.equipmentId ? await this.equipment.findOrFail(request.equipmentId) : null;
    const roomId = request.roomId ?? equipment?.roomId ?? null;
    const room = roomId ? await this.rooms.findOrFail(roomId) : null;
    const priority = oneOf(request.priority, TicketPriority, 'Priorité');
    const title = requiredText(request.title, 'Le titre');
    if (title.length > 160) throw new BadRequestException('Titre trop long (160 caractères maximum).');

    const saved = await this.tickets.save(
      this.tickets.create({
        equipmentId: equipment?.id ?? null,
        roomId: room?.id ?? null,
        title,
        description: optionalText(request.description) ?? null,
        priority,
        status: TicketStatus.OPEN,
        assignedTo: optionalText(request.assignedTo) ?? null,
        reportedByName: optionalText(request.reportedByName) ?? null,
        cost: null,
        resolution: null,
        resolvedAt: null,
      }),
    );
    const ticket: MaintenanceTicket = { ...saved, equipment, room };
    if (isSerious(priority)) await this.escalate(ticket);
    return toTicketDto(ticket);
  }

  async update(request: UpdateTicketRequest): Promise<MaintenanceTicketDto> {
    const ticket = await this.tickets.findOne({
      where: { id: request.id },
      relations: { equipment: { room: true }, room: true },
    });
    if (!ticket) throw new NotFoundException('Ticket de maintenance introuvable.');
    const data = request.data ?? {};
    const wasResolved = ticket.status === TicketStatus.RESOLVED;
    const wasSerious = isSerious(ticket.priority);

    if (data.title !== undefined) ticket.title = requiredText(data.title, 'Le titre');
    if (data.description !== undefined) ticket.description = optionalText(data.description) ?? null;
    if (data.priority !== undefined) ticket.priority = oneOf(data.priority, TicketPriority, 'Priorité');
    if (data.status !== undefined) ticket.status = oneOf(data.status, TicketStatus, 'Statut');
    if (data.assignedTo !== undefined) ticket.assignedTo = optionalText(data.assignedTo) ?? null;
    if (data.cost !== undefined) ticket.cost = data.cost === null ? null : amount(data.cost, 'Le coût');
    if (data.resolution !== undefined) ticket.resolution = optionalText(data.resolution) ?? null;

    const resolvedNow = !wasResolved && ticket.status === TicketStatus.RESOLVED;
    if (resolvedNow) ticket.resolvedAt = new Date();
    if (wasResolved && ticket.status !== TicketStatus.RESOLVED) ticket.resolvedAt = null;

    const { equipment, room, ...columns } = ticket;
    await this.tickets.save(columns);

    if (resolvedNow) {
      if (equipment) {
        if (equipment.status === EquipmentStatus.MAINTENANCE || equipment.status === EquipmentStatus.OUT_OF_ORDER) {
          equipment.status = EquipmentStatus.OPERATIONAL;
        }
        equipment.lastMaintenanceAt = toDateOnly();
        await this.equipmentRepo.save(equipment);
      }
      this.events.publish(EVENTS.maintenanceResolved, this.event(ticket));
    } else if (ticket.status !== TicketStatus.RESOLVED && isSerious(ticket.priority) && !wasSerious) {
      await this.escalate(ticket);
    }
    return toTicketDto(ticket);
  }

  /** Serious problem: take an operational machine out of service and alert the owner (n8n). */
  private async escalate(ticket: MaintenanceTicket): Promise<void> {
    if (ticket.equipment && ticket.equipment.status === EquipmentStatus.OPERATIONAL) {
      ticket.equipment.status = EquipmentStatus.MAINTENANCE;
      await this.equipmentRepo.save(ticket.equipment);
    }
    this.events.publish(EVENTS.maintenanceOpened, this.event(ticket));
  }

  private event(ticket: MaintenanceTicket): MaintenanceEvent {
    return {
      ticketId: ticket.id,
      title: ticket.title,
      priority: ticket.priority,
      equipmentName: ticket.equipment?.name ?? null,
      roomName: ticket.room?.name ?? ticket.equipment?.room?.name ?? null,
      cost: ticket.cost,
      at: (ticket.resolvedAt ?? ticket.openedAt ?? new Date()).toISOString(),
    };
  }
}
