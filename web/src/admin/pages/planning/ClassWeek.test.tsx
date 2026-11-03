// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClassSessionDto } from '../../../api/types';
import { renderInLang } from '../../../test/render';
import { ClassWeek } from './ClassWeek';

// Tests run in Africa/Tunis: local times are the gym's.
const local = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min);
const days = Array.from({ length: 7 }, (_, i) => local(2 + i, 0)); // Monday 2 – Sunday 8 November 2026
const now = local(3, 11); // Tuesday 11:00

const session = (id: string, title: string, startsAt: Date, minutes: number): ClassSessionDto => ({
  id,
  title,
  description: null,
  coachId: null,
  coachName: null,
  room: null,
  color: null,
  startsAt: startsAt.toISOString(),
  endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
  capacity: 20,
  bookedCount: 0,
  spotsLeft: 20,
  waitlistCount: 0,
  waitlistCapacity: 10,
  spotSelection: false,
  takenSpots: [],
  bookingOpensAt: startsAt.toISOString(),
  bookingClosesAt: startsAt.toISOString(),
  cancelDeadline: startsAt.toISOString(),
});

function renderWeek(sessions: ClassSessionDto[]) {
  renderInLang(<ClassWeek days={days} sessions={sessions} now={now} pendingIds={new Set()} onOpen={() => undefined} onMove={() => undefined} />);
}

const endHandle = (title: string, time: string) => screen.queryByRole('button', { name: `Heure de fin de ${title} : ${time}` });

describe('ClassWeek end handle', () => {
  it('lets short classes (30 minutes or less) be stretched from their bottom edge too', () => {
    renderWeek([
      session('hiit', 'HIIT Express', local(6, 12, 30), 30),
      session('abs', 'Abdos 15', local(6, 18), 15),
      session('pump', 'Body Pump', local(6, 19), 60),
    ]);
    expect(endHandle('HIIT Express', '13:00')).not.toBeNull();
    expect(endHandle('Abdos 15', '18:15')).not.toBeNull();
    expect(endHandle('Body Pump', '20:00')).not.toBeNull();
  });

  it('offers no handle on a class that already started', () => {
    renderWeek([session('morning', 'Réveil musculaire', local(3, 10, 30), 30)]);
    expect(endHandle('Réveil musculaire', '11:00')).toBeNull();
  });
});
