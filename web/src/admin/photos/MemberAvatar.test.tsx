// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { session } from '../../api/client';
import type { Lang } from '../../i18n';
import { renderInLang } from '../../test/render';
import { MemberAvatar } from './MemberAvatar';

const ID = '5f1d7c2a-8e43-4b6a-9d10-3c2b1a0f9e88';
const NAME = 'Amira Ben Salah';
const UPDATED = '2026-11-03T09:15:00.000Z';

const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Lets every pending promise callback run. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

let fetchMock: Mock<typeof fetch>;
let created: Blob[];
let revoked: string[];

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>(async () => jpeg());
  vi.stubGlobal('fetch', fetchMock);
  // jsdom has no object URLs.
  created = [];
  revoked = [];
  class TestURL extends URL {
    static createObjectURL(blob: Blob) {
      created.push(blob);
      return `blob:avatar-${created.length}`;
    }
    static revokeObjectURL(url: string) {
      revoked.push(url);
    }
  }
  vi.stubGlobal('URL', TestURL);
  session.set({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresIn: 900,
    user: { id: 'u-1', email: 'accueil@example.com', phone: null, role: 'STAFF', firstName: 'Nour', lastName: 'Accueil', avatarUrl: null, specialty: null, bio: null, isActive: true, createdAt: '2026-01-05T08:00:00.000Z' },
  });
});

function renderAvatar(ui: ReactElement, lang: Lang = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderInLang(<QueryClientProvider client={client}>{ui}</QueryClientProvider>, lang);
}

const requested = () => fetchMock.mock.calls.map(([url]) => String(url));

describe('MemberAvatar', () => {
  it('shows the initials and requests nothing when the member has no photo (null)', async () => {
    renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={null} />);
    await settle();
    expect(screen.getByRole('img', { name: 'Amira Ben Salah, sans photo' }).textContent).toBe('AB');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the version of photoUpdatedAt with the staff token, as an object URL, with its alt text', async () => {
    renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} size="lg" />);

    const img = await screen.findByRole('img', { name: 'Photo de Amira Ben Salah' });

    expect(img.getAttribute('src')).toBe('blob:avatar-1');
    expect(requested()).toEqual([`/api/members/${ID}/photo?v=${Date.parse(UPDATED)}`]);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer access-1');
    expect(created.map((blob) => blob.type)).toEqual(['image/jpeg']);
  });

  it('asks for the latest photo when only the member id is known, and shows the initials on 404', async () => {
    fetchMock.mockResolvedValueOnce(json(404, { statusCode: 404, message: 'Aucune photo.' }));
    renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={undefined} />);

    expect(await screen.findByRole('img', { name: 'Amira Ben Salah, sans photo' })).toBeTruthy();
    expect(requested()).toEqual([`/api/members/${ID}/photo`]);
    expect(screen.queryByRole('img', { name: 'Photo de Amira Ben Salah' })).toBeNull();
    expect(created).toEqual([]);
  });

  it('shows the initials when the request fails', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { statusCode: 500, message: 'Erreur interne.' }));
    const { container } = renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} />);
    await settle();
    await settle();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AB');
  });

  it('falls back to the initials when the browser cannot show the file', async () => {
    renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} />);
    fireEvent.error(await screen.findByRole('img', { name: 'Photo de Amira Ben Salah' }));
    expect(screen.getByRole('img', { name: 'Amira Ben Salah, sans photo' })).toBeTruthy();
  });

  it('stays out of the way of screen readers next to the written name', async () => {
    const { container } = renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} decorative />);
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:avatar-1'));
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(screen.queryAllByRole('img')).toEqual([]);
  });

  it('revokes the object URL when it goes away', async () => {
    const view = renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} />);
    await screen.findByRole('img', { name: 'Photo de Amira Ben Salah' });
    expect(revoked).toEqual([]);
    view.unmount();
    expect(revoked).toEqual(['blob:avatar-1']);
  });

  it('shares one request between the avatars of the same photo', async () => {
    renderAvatar(
      <>
        <MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} size="lg" />
        <MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} size="xl" />
      </>,
    );
    expect(await screen.findAllByRole('img', { name: 'Photo de Amira Ben Salah' })).toHaveLength(2);
    expect(requested()).toHaveLength(1);
  });

  it('downloads a list thumbnail only once its row comes near the screen', async () => {
    const observers: { callback: IntersectionObserverCallback; disconnect: Mock }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly disconnect = vi.fn();
        constructor(callback: IntersectionObserverCallback) {
          observers.push({ callback, disconnect: this.disconnect });
        }
        observe() {}
      },
    );
    renderAvatar(<MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} size="md" />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));

    expect(await screen.findByRole('img', { name: 'Photo de Amira Ben Salah' })).toBeTruthy();
    expect(requested()).toHaveLength(1);
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it.each([
    ['en', 'Photo of Amira Ben Salah', 'Amira Ben Salah, no photo'],
    ['ar', 'صورة Amira Ben Salah', 'Amira Ben Salah، بدون صورة'],
  ] as const)('describes the photo in %s', async (lang, photo, initials) => {
    renderAvatar(
      <>
        <MemberAvatar memberId={ID} name={NAME} photoUpdatedAt={UPDATED} />
        <MemberAvatar memberId="other" name={NAME} photoUpdatedAt={null} />
      </>,
      lang,
    );
    expect(await screen.findByRole('img', { name: photo })).toBeTruthy();
    expect(screen.getByRole('img', { name: initials })).toBeTruthy();
  });
});
