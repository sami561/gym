export enum RoomType {
  MUSCULATION = 'MUSCULATION',
  CARDIO = 'CARDIO',
  COURS_COLLECTIFS = 'COURS_COLLECTIFS',
  CROSSFIT = 'CROSSFIT',
  VESTIAIRE = 'VESTIAIRE',
  ACCUEIL = 'ACCUEIL',
  AUTRE = 'AUTRE',
}

export enum EquipmentCategory {
  CARDIO = 'CARDIO',
  STRENGTH = 'STRENGTH',
  FREE_WEIGHTS = 'FREE_WEIGHTS',
  ACCESSORY = 'ACCESSORY',
  OTHER = 'OTHER',
}

export enum EquipmentStatus {
  OPERATIONAL = 'OPERATIONAL',
  MAINTENANCE = 'MAINTENANCE',
  OUT_OF_ORDER = 'OUT_OF_ORDER',
  RETIRED = 'RETIRED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
}

export enum LockerStatus {
  FREE = 'FREE',
  OCCUPIED = 'OCCUPIED',
  OUT_OF_ORDER = 'OUT_OF_ORDER',
}

export interface RoomDto {
  id: string;
  name: string;
  type: RoomType;
  capacity: number;
  floor: string | null;
  description: string | null;
  isActive: boolean;
  equipmentCount: number;
}

export interface CreateRoomRequest {
  name: string;
  type: RoomType;
  capacity: number;
  floor?: string | null;
  description?: string | null;
  isActive?: boolean;
}

export interface ListRoomsRequest {
  /** Back-office lists include inactive rooms; the public website does not. */
  includeInactive?: boolean;
}

export interface UpdateRoomRequest {
  id: string;
  data: Partial<CreateRoomRequest>;
}

export interface EquipmentDto {
  id: string;
  name: string;
  category: EquipmentCategory;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  roomId: string | null;
  roomName: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  warrantyUntil: string | null;
  status: EquipmentStatus;
  /** Preventive maintenance interval; nextMaintenanceAt is derived from it. */
  maintenanceIntervalDays: number | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceAt: string | null;
  notes: string | null;
}

export interface CreateEquipmentRequest {
  name: string;
  category: EquipmentCategory;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  roomId?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  warrantyUntil?: string | null;
  status?: EquipmentStatus;
  maintenanceIntervalDays?: number | null;
  lastMaintenanceAt?: string | null;
  notes?: string | null;
}

export interface UpdateEquipmentRequest {
  id: string;
  data: Partial<CreateEquipmentRequest>;
}

export interface ListEquipmentRequest {
  roomId?: string;
  status?: EquipmentStatus;
  category?: EquipmentCategory;
  search?: string;
  /** Only equipment whose preventive maintenance is due within N days (or overdue). */
  dueWithinDays?: number;
}

export interface MaintenanceTicketDto {
  id: string;
  equipmentId: string | null;
  equipmentName: string | null;
  roomId: string | null;
  roomName: string | null;
  title: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  reportedByName: string | null;
  assignedTo: string | null;
  cost: number | null;
  openedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface CreateTicketRequest {
  equipmentId?: string | null;
  roomId?: string | null;
  title: string;
  description?: string | null;
  priority: TicketPriority;
  assignedTo?: string | null;
  reportedByName?: string | null;
}

export interface UpdateTicketRequest {
  id: string;
  data: {
    title?: string;
    description?: string | null;
    priority?: TicketPriority;
    status?: TicketStatus;
    assignedTo?: string | null;
    cost?: number | null;
    resolution?: string | null;
  };
}

export interface ListTicketsRequest {
  status?: TicketStatus;
  equipmentId?: string;
  roomId?: string;
}

export interface LockerDto {
  id: string;
  number: string;
  roomId: string | null;
  roomName: string | null;
  status: LockerStatus;
  memberId: string | null;
  memberName: string | null;
  assignedUntil: string | null;
}

export interface CreateLockersRequest {
  roomId?: string | null;
  /** Creates lockers numbered prefix + from..to, e.g. "H-" 1..40. */
  prefix?: string;
  from: number;
  to: number;
}

export interface AssignLockerRequest {
  id: string;
  memberId: string | null;
  memberName?: string | null;
  assignedUntil?: string | null;
  status?: LockerStatus;
}

export interface ListLockersRequest {
  roomId?: string;
  status?: LockerStatus;
}

export interface FacilityStats {
  rooms: number;
  equipmentTotal: number;
  equipmentOutOfOrder: number;
  maintenanceDue: number;
  openTickets: number;
  urgentTickets: number;
  lockersFree: number;
  lockersOccupied: number;
}
