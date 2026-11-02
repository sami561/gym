import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Role } from '../api/types';
import { homeFor, NAV, navFor } from './nav';

const pages = (role: Role) => navFor(role).flatMap((section) => section.items.map((item) => item.to));
const ADMIN_ONLY = ['/admin/performance', '/admin/finance', '/admin/promos', '/admin/equipe'];

describe('navFor', () => {
  it('gives members, who use the mobile app, no back-office menu', () => {
    expect(navFor('MEMBER')).toEqual([]);
  });

  it('shows coaches their planning, training and tasks only', () => {
    expect(pages('COACH')).toEqual(['/admin/planning', '/admin/entrainement', '/admin/taches']);
  });

  it('drops the sections left empty for a role', () => {
    expect(navFor('COACH').map((section) => section.title)).toEqual(['Activité', 'Organisation']);
    for (const role of ['ADMIN', 'STAFF', 'COACH'] as const) {
      expect(navFor(role).every((section) => section.items.length > 0)).toBe(true);
    }
  });

  it('shows the front desk the daily pages but no admin-only page', () => {
    const desk = pages('STAFF');
    expect(desk).toEqual(expect.arrayContaining(['/admin', '/admin/membres', '/admin/scanner', '/admin/paiements']));
    for (const page of ADMIN_ONLY) expect(desk).not.toContain(page);
  });

  it('shows admins every page, once', () => {
    const all = NAV.flatMap((section) => section.items.map((item) => item.to));
    expect(pages('ADMIN')).toEqual(all);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('homeFor', () => {
  it.each(['ADMIN', 'STAFF', 'COACH'] as const)('sends %s to a page in their own menu', (role) => {
    expect(pages(role)).toContain(homeFor(role));
  });

  it('sends coaches, who have no dashboard, to the planning', () => {
    expect(homeFor('COACH')).toBe('/admin/planning');
    expect(homeFor('ADMIN')).toBe('/admin');
  });
});

describe('route guards (AdminApp.tsx)', () => {
  // The routes gate each page with their own role list: a drift either shows a menu entry that
  // answers "Accès réservé" or lets a role open by URL a page its menu hides.
  it('let exactly the roles that see a page in the menu open it', () => {
    const source = readFileSync(new URL('./AdminApp.tsx', import.meta.url), 'utf8');
    const lists = new Map(
      Array.from(source.matchAll(/const (\w+): Role\[\] = \[([^\]]*)\]/g), ([, name, body]) => [
        name,
        Array.from(body.matchAll(/'(\w+)'/g), (match) => match[1]).sort(),
      ]),
    );
    const gates = new Map(
      Array.from(source.matchAll(/<Route\s+path="([^"]+)"\s+element=\{gate\((\w+),/g), ([, path, list]) => [`/admin/${path}`, lists.get(list)]),
    );
    // The index route goes through AdminHome, which gates the dashboard.
    gates.set('/admin', lists.get(/function AdminHome\(\)[\s\S]*?gate\((\w+),/.exec(source)?.[1] ?? ''));

    for (const item of NAV.flatMap((section) => section.items)) {
      expect(gates.get(item.to), item.to).toEqual([...item.roles].sort());
    }
  });
});
