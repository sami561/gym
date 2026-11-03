// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceDto, EmployeeDto, EmployeePosition, ShiftDto } from '../../../api/types-ops';
import { ConfirmProvider } from '../../../components/ui/Modal';
import { ToastProvider } from '../../../components/ui/Toast';
import { startOfWeek } from '../../../lib/format';
import { renderInLang } from '../../../test/render';
import { TeamCalendarPage } from './TeamCalendarPage';

const employee = (id: string, firstName: string, lastName: string, position: EmployeePosition): EmployeeDto => ({
  id,
  userId: null,
  firstName,
  lastName,
  email: null,
  phone: null,
  position,
  contractType: 'CDI',
  hireDate: '2026-01-01',
  endDate: null,
  salaryType: 'MONTHLY',
  baseSalary: 1000,
  commissionRate: 0,
  cin: null,
  cnssNumber: null,
  rib: null,
  status: 'ACTIVE',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});
const employees = [employee('e1', 'Ahmed', 'Kefi', 'RECEPTION'), employee('e2', 'Sami', 'Trabelsi', 'COACH')];
const nameOf = (id: string) => {
  const e = employees.find((item) => item.id === id)!;
  return `${e.firstName} ${e.lastName}`;
};

/** `h:min` on `day` (local time, which is the gym's in tests). */
const at = (day: Date, h: number, min = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min).toISOString();
const shift = (id: string, employeeId: string, startsAt: string, endsAt: string): ShiftDto => ({
  id,
  employeeId,
  employeeName: nameOf(employeeId),
  startsAt,
  endsAt,
  task: null,
  roomName: null,
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let shifts: ShiftDto[];
let attendance: AttendanceDto[];
let patches: { id: string; body: { employeeId: string; startsAt: string; endsAt: string } }[];
/** Answer of the next PATCH /api/shifts/:id: saved (default), or held until the test settles it. */
let answer: () => Promise<Response> | Response;

beforeEach(() => {
  attendance = [];
  patches = [];
  answer = () => {
    const { id, body } = patches[patches.length - 1];
    shifts = shifts.map((s) => (s.id === id ? { ...s, ...body, employeeName: nameOf(body.employeeId) } : s));
    return json(200, shifts.find((s) => s.id === id));
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (url.pathname === '/api/employees') return json(200, employees);
      if (url.pathname === '/api/attendance') return json(200, attendance);
      if (url.pathname === '/api/shifts' && method === 'GET') return json(200, shifts);
      if (url.pathname.startsWith('/api/shifts/') && method === 'PATCH') {
        patches.push({ id: url.pathname.split('/').pop()!, body: JSON.parse(String(init?.body)) });
        return answer();
      }
      return json(404, { statusCode: 404, message: 'Introuvable.' });
    }),
  );

  // jsdom has no layout. Week view: a grid of 100 × 60 px table cells. Day view: 44 px rows whose
  // track (06:00 → `to`) is 960 px wide from x = 132.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (x: number, y: number, width: number, height: number) =>
      ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height, toJSON: () => ({}) }) as DOMRect;
    const li = this.closest('li');
    if (li?.parentElement) {
      const row = [...li.parentElement.children].indexOf(li);
      if (this.hasAttribute('data-track')) return rect(132, row * 44, 960, 44);
      if (this.getAttribute('aria-roledescription') === 'créneau déplaçable') return rect(400, row * 44 + 6, 100, 20);
      if (this.tagName === 'BUTTON') return rect(498, row * 44 + 6, 8, 20); // end grip
      return rect(0, row * 44, 1092, 44);
    }
    const cell = this.closest('td,th') as HTMLTableCellElement | null;
    if (cell) {
      const x = cell.cellIndex * 100;
      const y = (cell.parentElement as HTMLTableRowElement).rowIndex * 60;
      if (this.getAttribute('aria-roledescription')) return rect(x + 5, y + 5, 90, 20);
      return rect(x, y, 100, 60);
    }
    return rect(0, 0, 0, 0);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets timers, promise callbacks and animation frames run (dnd-kit listens after a timeout). */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderInLang(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <TeamCalendarPage />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Space picks the item up, the arrows move it, Space drops it. */
async function keyboardDrag(item: HTMLElement, ...arrows: string[]) {
  act(() => item.focus());
  fireEvent.keyDown(item, { code: 'Space', key: ' ' });
  await settle();
  for (const arrow of arrows) {
    fireEvent.keyDown(item, { code: arrow, key: arrow });
    await settle();
  }
}
async function drop(item: HTMLElement) {
  fireEvent.keyDown(item, { code: 'Space', key: ' ' });
  await settle();
  await settle();
}

const chipOf = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name},`) });
const cellIndex = (element: Element) => (element.closest('td') as HTMLTableCellElement).cellIndex;

describe('team calendar, week view', () => {
  const monday = startOfWeek(new Date());

  it('keeps the keyboard focus on a shift dropped on another day, while it saves and after', async () => {
    shifts = [shift('s1', 'e1', at(monday, 8), at(monday, 12))];
    const saved = deferred<void>();
    const save = answer;
    answer = async () => {
      await saved.promise;
      return save();
    };
    renderPage();
    const chip = await chipOf('Ahmed Kefi');
    expect(cellIndex(chip)).toBe(1);

    await keyboardDrag(chip, 'ArrowRight');
    await drop(chip);

    // The chip was created again in Tuesday's cell; the focus followed it instead of falling to <body>.
    const moved = await chipOf('Ahmed Kefi');
    await waitFor(() => expect(cellIndex(moved)).toBe(2));
    expect(moved).not.toBe(chip);
    expect(document.activeElement).toBe(moved);

    await act(async () => saved.resolve());
    await settle();
    expect(patches.map((p) => p.body.startsAt)).toEqual([at(addDay(monday), 8)]);
    expect(document.activeElement).toBe(await chipOf('Ahmed Kefi'));
  });

  it('gives the focus back to the shift when the move is refused and rolled back', async () => {
    shifts = [shift('s1', 'e1', at(monday, 8), at(monday, 12))];
    const refused = deferred<void>();
    answer = async () => {
      await refused.promise;
      return json(409, { statusCode: 409, message: 'Ahmed Kefi a déjà un créneau à ce moment-là.' });
    };
    renderPage();
    const chip = await chipOf('Ahmed Kefi');

    await keyboardDrag(chip, 'ArrowDown');
    await drop(chip);
    expect(document.activeElement).toBe(await chipOf('Sami Trabelsi'));

    await act(async () => refused.resolve());
    await settle();
    const back = await chipOf('Ahmed Kefi');
    expect(cellIndex(back)).toBe(1);
    expect(document.activeElement).toBe(back);
  });

  it('shows the drop preview out of the flow, so no row grows and moves the drop targets', async () => {
    shifts = [shift('s1', 'e1', at(monday, 8), at(monday, 12))];
    renderPage();
    const chip = await chipOf('Ahmed Kefi');

    await keyboardDrag(chip, 'ArrowRight');

    const ghost = screen.getByText('08:00 – 12:00');
    expect(ghost.getAttribute('aria-hidden')).toBe('true');
    expect(cellIndex(ghost)).toBe(2);
    expect(ghost.className.split(' ')).toEqual(expect.arrayContaining(['absolute', 'pointer-events-none']));
    expect(ghost.parentElement!.className.split(' ')).toContain('relative');
    fireEvent.keyDown(chip, { code: 'Escape', key: 'Escape' });
    await settle();
  });
});

describe('team calendar, day view', () => {
  const today = new Date();

  async function openDay() {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Jour' }));
  }

  it('keeps the keyboard focus on a shift dropped on another employee', async () => {
    shifts = [shift('s1', 'e1', at(today, 9), at(today, 11))];
    await openDay();
    const bar = await screen.findByRole('button', { name: /^Ahmed Kefi :/ });

    await keyboardDrag(bar, 'ArrowDown');
    await drop(bar);

    const moved = await screen.findByRole('button', { name: /^Sami Trabelsi :/ });
    expect(moved).not.toBe(bar);
    expect(document.activeElement).toBe(moved);
    expect(patches.map((p) => p.body.employeeId)).toEqual(['e2']);
  });

  it('stops a stretched end at 23:45: the shift editor cannot reopen a shift ending at midnight', async () => {
    shifts = [shift('s1', 'e1', at(today, 16), at(today, 23, 15)), shift('s2', 'e2', at(today, 20), at(today, 22))];
    await openDay();
    const grip = await screen.findByRole('button', { name: 'Heure de fin du créneau de Sami Trabelsi : 22:00' });

    await keyboardDrag(grip, ...Array<string>(12).fill('ArrowRight')); // + 3 h
    await drop(grip);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].body).toEqual({ employeeId: 'e2', startsAt: at(today, 20), endsAt: at(today, 23, 45) });
  });

  it('shows the clocked times when the presence bar is hovered', async () => {
    shifts = [];
    attendance = [
      {
        id: 'a1',
        employeeId: 'e1',
        employeeName: 'Ahmed Kefi',
        clockIn: at(today, 8, 2),
        clockOut: at(today, 14, 5),
        minutes: 363,
        lateMinutes: 2,
        source: 'KIOSK',
      },
    ];
    await openDay();

    const presence = await screen.findByTitle('Pointé 08:02–14:05');
    // pointer-events: none would hide its title (no hover) and send its clicks to the row ("new shift").
    expect(presence.className.split(' ')).not.toContain('pointer-events-none');
  });
});

function addDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
}
