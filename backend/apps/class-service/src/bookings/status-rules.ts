import { BadRequestException } from '@nestjs/common';
import { BookingStatus, STAFF_BOOKING_STATUSES } from '@app/common';

/**
 * Status set by hand (bookings.setStatus, whoever the bus caller is). WAITLISTED and LATE_CANCELLED
 * would queue a member or hand out a strike outside the reservation rules.
 */
export function assertStaffStatus(status: unknown): BookingStatus {
  if (status === BookingStatus.WAITLISTED) {
    throw new BadRequestException("La liste d'attente est gérée automatiquement par les réservations.");
  }
  if (status === BookingStatus.LATE_CANCELLED) {
    throw new BadRequestException('Une annulation tardive est enregistrée automatiquement quand le membre annule après le délai.');
  }
  if (!(STAFF_BOOKING_STATUSES as readonly unknown[]).includes(status)) throw new BadRequestException('Statut invalide.');
  return status as BookingStatus;
}

/** NO_SHOW counts as a strike: only once the session has started. */
export function assertStatusTiming(status: BookingStatus, startsAt: Date, now: Date = new Date()): void {
  if (status === BookingStatus.NO_SHOW && now < startsAt) {
    throw new BadRequestException('Impossible de marquer absent avant le début du cours.');
  }
}
