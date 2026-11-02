import { addDays, toDateOnly } from '@app/common';

export interface MaintenanceSchedule {
  lastMaintenanceAt: string | null;
  purchaseDate: string | null;
  maintenanceIntervalDays: number | null;
}

/** Next preventive maintenance: last maintenance (or purchase) + interval; null when not planned. */
export function nextMaintenanceAt(equipment: MaintenanceSchedule): string | null {
  const from = equipment.lastMaintenanceAt ?? equipment.purchaseDate;
  if (!from || !equipment.maintenanceIntervalDays || equipment.maintenanceIntervalDays <= 0) return null;
  return addDays(from, equipment.maintenanceIntervalDays);
}

/** Due within `withinDays` days from `today`, overdue included. */
export function isMaintenanceDue(next: string | null, withinDays: number, today: string = toDateOnly()): boolean {
  return next !== null && next <= addDays(today, withinDays);
}
