// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicCoach } from '../../api/types';
import { renderInLang } from '../../test/render';
import { Coaches } from './Coaches';

const coach = (id: string, firstName: string, lastName: string, avatarUrl: string | null): PublicCoach => ({
  id,
  firstName,
  lastName,
  specialty: 'CrossFit',
  bio: null,
  avatarUrl,
});

let coaches: PublicCoach[];

beforeEach(() => {
  coaches = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(coaches), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderInLang(
    <QueryClientProvider client={client}>
      <Coaches />
    </QueryClientProvider>,
  );
}

/** The portrait next to the coach's name (decorative: the name is the heading). */
const portrait = async (name: string) => (await screen.findByRole('heading', { name })).closest('li')!.firstElementChild as HTMLElement;

describe('website coaches', () => {
  it('shows the photo uploaded in the back office from its public URL, and initials without a photo', async () => {
    coaches = [
      coach('c-1', 'Sami', 'Trabelsi', '/api/public/coaches/c-1/photo?v=1762160100000'),
      coach('c-2', 'Ines', 'Mansour', 'https://example.com/ines.jpg'),
      coach('c-3', 'Yassine', 'Jaziri', null),
    ];
    renderSection();

    const sami = await portrait('Sami Trabelsi');
    expect(sami.tagName).toBe('IMG');
    expect(sami.getAttribute('src')).toBe('/api/public/coaches/c-1/photo?v=1762160100000');
    expect(sami.getAttribute('alt')).toBe('');
    expect((await portrait('Ines Mansour')).getAttribute('src')).toBe('https://example.com/ines.jpg');
    const yassine = await portrait('Yassine Jaziri');
    expect(yassine.tagName).toBe('SPAN');
    expect(yassine.textContent).toBe('YJ');
  });

  it('falls back to the initials when the photo does not load', async () => {
    coaches = [coach('c-2', 'Ines', 'Mansour', 'https://example.com/gone.jpg')];
    renderSection();

    fireEvent.error(await portrait('Ines Mansour'));

    const fallback = await portrait('Ines Mansour');
    expect(fallback.tagName).toBe('SPAN');
    expect(fallback.textContent).toBe('IM');
  });
});
