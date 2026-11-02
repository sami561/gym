import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingStatus } from '@app/common';
import { BookingStatusDto } from './classes.dto';

const { BOOKED, WAITLISTED, CANCELLED, LATE_CANCELLED, ATTENDED, NO_SHOW } = BookingStatus;

async function errors(status: unknown): Promise<string[]> {
  const found = await validate(plainToInstance(BookingStatusDto, { status }));
  return found.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('BookingStatusDto (PATCH /api/bookings/:id)', () => {
  it('accepts the statuses staff set by hand', async () => {
    for (const status of [BOOKED, CANCELLED, ATTENDED, NO_SHOW]) expect(await errors(status)).toEqual([]);
  });

  it('refuses the waitlist, late cancellations (a strike) and unknown values', async () => {
    for (const status of [WAITLISTED, LATE_CANCELLED, 'PAID', undefined]) {
      expect(await errors(status)).toEqual(['Statut invalide (BOOKED, CANCELLED, ATTENDED ou NO_SHOW).']);
    }
  });
});
