// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GymInfo } from '../../api/types';
import type { Lang } from '../../i18n';
import { FALLBACK_GYM } from '../../lib/fallbacks';
import { renderInLang } from '../../test/render';
import { Footer } from './Footer';
import { InstagramBand } from './InstagramBand';
import { Location } from './Location';

const gym: GymInfo = {
  ...FALLBACK_GYM,
  instagram: 'https://www.instagram.com/example-gym/',
  facebook: 'https://www.facebook.com/example-gym/',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(gym), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
});

function renderSection(ui: ReactElement, lang: Lang = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderInLang(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
    lang,
  );
}

/** The section first shows the fallback gym, then the API answer: wait for the API's URL. */
const expectLink = (name: string | RegExp, url: string) =>
  waitFor(() => expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(url));

describe('gym social links on the website', () => {
  it('falls back to the real Facebook page while the API is unreachable', () => {
    expect(FALLBACK_GYM.facebook).toBe('https://www.facebook.com/p/Meliora-Gym-61589769249533/');
  });

  it('lists Facebook after Instagram in the footer, with the URLs from the API', async () => {
    renderSection(<Footer />);
    await expectLink('Facebook', gym.facebook);
    const links = within(screen.getByRole('contentinfo')).getAllByRole('link').map((link) => link.textContent);
    expect(links.indexOf('Facebook')).toBe(links.indexOf('Instagram') + 1);
  });

  it('gives the Facebook contact link a name that says where it goes', async () => {
    renderSection(<Location />);
    await expectLink('Facebook Meliora Gym', gym.facebook);
    await expectLink('@example-gym', gym.instagram);
  });

  it.each([
    ['fr', 'Aussi sur Facebook'],
    ['en', 'Also on Facebook'],
    ['ar', 'أيضًا على فيسبوك'],
  ] as const)('adds a Facebook link under the Instagram button (%s)', async (lang, label) => {
    renderSection(<InstagramBand />, lang);
    await expectLink(label, gym.facebook);
    await expectLink(/@gymmeliora/, gym.instagram);
  });
});
