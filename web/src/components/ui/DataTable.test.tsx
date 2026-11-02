// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInLang } from '../../test/render';
import { DataTable, type Column } from './DataTable';

interface Member {
  id: string;
  name: string;
  visits: number;
}

const MEMBERS: Member[] = [
  { id: 'm1', name: 'Amira Ben Salah', visits: 12 },
  { id: 'm2', name: 'Youssef Trabelsi', visits: 3 },
];

const COLUMNS: Column<Member>[] = [
  { key: 'name', header: 'Nom', cell: (member) => member.name },
  { key: 'visits', header: <span className="sr-only">Entrées</span>, cell: (member) => member.visits, align: 'right' },
];

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('DataTable', () => {
  it('translates text headers and renders one row per record', () => {
    renderInLang(<DataTable columns={COLUMNS} rows={MEMBERS} rowKey={(member) => member.id} />, 'en');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Entrées' })).toBeTruthy();
    expect(bodyRows().map((row) => row.textContent)).toEqual(['Amira Ben Salah12', 'Youssef Trabelsi3']);
  });

  it('aligns number columns with the logical end, so they flip in Arabic', () => {
    renderInLang(<DataTable columns={COLUMNS} rows={MEMBERS} rowKey={(member) => member.id} />, 'ar');
    const [name, visits] = screen.getAllByRole('cell');
    expect(visits.className).toContain('text-end');
    expect(name.className).toContain('text-start');
    expect(visits.className).not.toMatch(/text-(left|right)/);
  });

  it('shows placeholder rows while loading, without the empty state', () => {
    renderInLang(<DataTable columns={COLUMNS} rows={[]} rowKey={(member) => member.id} loading empty={<p>Aucun membre</p>} />);
    expect(bodyRows()).toHaveLength(5);
    expect(screen.queryByText('Aucun membre')).toBeNull();
  });

  it('shows the empty state once loaded with no rows', () => {
    renderInLang(<DataTable columns={COLUMNS} rows={[]} rowKey={(member) => member.id} empty={<p>Aucun membre</p>} />);
    expect(bodyRows()).toHaveLength(0);
    expect(screen.getByText('Aucun membre')).toBeTruthy();
  });

  it('opens a row on click or with Enter when rows are clickable', () => {
    const onRowClick = vi.fn();
    renderInLang(<DataTable columns={COLUMNS} rows={MEMBERS} rowKey={(member) => member.id} onRowClick={onRowClick} />);
    const [first, second] = bodyRows();
    expect(first.tabIndex).toBe(0);
    fireEvent.click(first);
    fireEvent.keyDown(second, { key: 'Enter' });
    fireEvent.keyDown(second, { key: 'a' });
    expect(onRowClick.mock.calls).toEqual([[MEMBERS[0]], [MEMBERS[1]]]);
  });

  it('keeps plain rows out of the tab order', () => {
    renderInLang(<DataTable columns={COLUMNS} rows={MEMBERS} rowKey={(member) => member.id} />);
    expect(bodyRows()[0].hasAttribute('tabindex')).toBe(false);
  });
});
