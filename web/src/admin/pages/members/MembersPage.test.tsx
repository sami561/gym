// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberDto } from '../../../api/types';
import { ToastProvider } from '../../../components/ui/Toast';
import { PhotoError, preparePhoto } from '../../../lib/photo';
import { renderInLang } from '../../../test/render';
import { MembersPage } from './MembersPage';

// jsdom cannot decode or draw an image: the preparation itself is tested in lib/photo.test.ts.
vi.mock('../../../lib/photo', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/photo')>()), preparePhoto: vi.fn() }));

const MEMBER: MemberDto = {
  id: 'm-1',
  memberCode: 'MLR-0042',
  firstName: 'Amira',
  lastName: 'Ben Salah',
  email: 'amira@example.com',
  phone: null,
  birthDate: null,
  gender: null,
  emergencyContact: null,
  notes: null,
  status: 'ACTIVE',
  joinedAt: '2026-11-03T09:00:00.000Z',
  photoUpdatedAt: null,
};
const UPDATED = '2026-11-03T09:15:00.000Z';
/** What preparePhoto() makes of the picked file: the JPEG that is uploaded. */
const prepared = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])], { type: 'image/jpeg' });

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let requests: { method: string; path: string; body: unknown }[];
/** Answer of PUT /api/members/m-1/photo. */
let photoAnswer: () => Response;
let objectUrls: Blob[];

beforeEach(() => {
  requests = [];
  objectUrls = [];
  photoAnswer = () => json(200, { ...MEMBER, photoUpdatedAt: UPDATED });
  // jsdom has no object URLs.
  class TestURL extends URL {
    static createObjectURL(blob: Blob) {
      objectUrls.push(blob);
      return `blob:photo-${objectUrls.length}`;
    }
    static revokeObjectURL() {}
  }
  vi.stubGlobal('URL', TestURL);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      requests.push({ method, path: url.pathname, body: init?.body });
      if (url.pathname === '/api/members' && method === 'GET') return json(200, { items: [], total: 0, page: 1, pageSize: 20 });
      if (url.pathname === '/api/plans') return json(200, []);
      if (url.pathname === '/api/members' && method === 'POST') return json(201, { member: MEMBER, subscription: null, temporaryPassword: 'Tmp-4821' });
      if (url.pathname === '/api/members/m-1/photo' && method === 'PUT') return photoAnswer();
      return json(404, { statusCode: 404, message: 'Introuvable.' });
    }),
  );
  vi.mocked(preparePhoto).mockResolvedValue(prepared);
});

afterEach(() => {
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderInLang(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <MembersPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Requests that change something, in order. */
const writes = () => requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`);

/** Opens "Nouveau membre" and types the required fields. */
async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Nouveau membre' }));
  const form = await screen.findByRole('dialog', { name: 'Nouveau membre' });
  fireEvent.change(within(form).getByLabelText('Prénom *'), { target: { value: 'Amira' } });
  fireEvent.change(within(form).getByLabelText('Nom de famille *'), { target: { value: 'Ben Salah' } });
  fireEvent.change(within(form).getByLabelText('E-mail *'), { target: { value: 'amira@example.com' } });
  return form;
}

/** Picks a file in the (hidden) file input of the photo step. */
function importFile(form: HTMLElement, file = new File(['raw'], 'portrait.jpg', { type: 'image/jpeg' })) {
  const input = form.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('new member photo', () => {
  it('keeps the photo in the form, uploads it once the member exists, and shows it with the temporary password', async () => {
    renderPage();
    const form = await openForm();

    expect(within(form).getByText('Aucune photo.')).toBeTruthy();
    importFile(form);

    expect(await within(form).findByText('Nouvelle photo, pas encore enregistrée.')).toBeTruthy();
    const preview = await within(form).findByRole('img', { name: 'Photo de Amira Ben Salah' });
    expect(preview.getAttribute('src')).toBe('blob:photo-1');
    expect(objectUrls).toEqual([prepared]);
    expect(writes()).toEqual([]); // nothing is sent before "Créer le membre"

    fireEvent.click(within(form).getByRole('button', { name: 'Créer le membre' }));
    const created = await screen.findByRole('dialog', { name: 'Membre créé' });

    expect(writes()).toEqual(['POST /api/members', 'PUT /api/members/m-1/photo']);
    const upload = requests.find((r) => r.method === 'PUT')!.body as FormData;
    const sent = upload.get('photo') as File;
    expect([sent.type, sent.size, sent.name]).toEqual(['image/jpeg', prepared.size, 'photo.jpg']);
    expect(within(created).getByText('Tmp-4821')).toBeTruthy();
    expect(within(created).queryByRole('alert')).toBeNull();
    // The JPEG just uploaded is shown as is: it is not downloaded again.
    expect(await within(created).findByRole('img', { name: 'Photo de Amira Ben Salah' })).toBeTruthy();
    expect(requests.some((r) => r.path === '/api/members/m-1/photo' && r.method === 'GET')).toBe(false);
  });

  it('says the member is created when the photo upload fails, and still shows the temporary password', async () => {
    photoAnswer = () => json(413, { statusCode: 413, message: 'La photo dépasse 512 Ko.' });
    renderPage();
    const form = await openForm();
    importFile(form);
    await within(form).findByText('Nouvelle photo, pas encore enregistrée.');

    fireEvent.click(within(form).getByRole('button', { name: 'Créer le membre' }));
    const created = await screen.findByRole('dialog', { name: 'Membre créé' });

    expect(within(created).getByRole('alert').textContent).toBe(
      'Membre créé, mais la photo n’a pas été enregistrée : La photo dépasse 512 Ko. Ajoutez-la depuis sa fiche.',
    );
    expect(within(created).getByText('Tmp-4821')).toBeTruthy();
    expect(within(created).getByRole('img', { name: 'Amira Ben Salah, sans photo' })).toBeTruthy();
    expect(within(created).getByRole('button', { name: 'Ouvrir la fiche' })).toBeTruthy();
    expect(writes()).toEqual(['POST /api/members', 'PUT /api/members/m-1/photo']); // created once
  });

  it('shows the failure in English and Arabic too', async () => {
    photoAnswer = () => json(413, { statusCode: 413, message: 'La photo dépasse 512 Ko.' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderInLang(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter>
            <MembersPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
      'ar',
    );
    fireEvent.click(await screen.findByRole('button', { name: 'عضو جديد' }));
    const form = await screen.findByRole('dialog', { name: 'عضو جديد' });
    fireEvent.change(within(form).getByLabelText('الاسم *'), { target: { value: 'Amira' } });
    fireEvent.change(within(form).getByLabelText('اللقب *'), { target: { value: 'Ben Salah' } });
    fireEvent.change(within(form).getByLabelText('البريد الإلكتروني *'), { target: { value: 'amira@example.com' } });
    expect(within(form).getByRole('group', { name: 'الصورة' })).toBeTruthy();
    importFile(form);
    await within(form).findByText('صورة جديدة، لم تُحفظ بعد.');

    fireEvent.click(within(form).getByRole('button', { name: 'إنشاء العضو' }));
    const created = await screen.findByRole('dialog', { name: 'تم إنشاء العضو' });
    expect(within(created).getByRole('alert').textContent).toBe('تم إنشاء العضو لكن لم تُحفظ الصورة: La photo dépasse 512 Ko. أضفها من ملفه.');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('can remove the photo before saving: nothing is uploaded', async () => {
    renderPage();
    const form = await openForm();
    importFile(form);
    await within(form).findByText('Nouvelle photo, pas encore enregistrée.');

    fireEvent.click(within(form).getByRole('button', { name: 'Retirer la photo' }));

    expect(within(form).getByText('Aucune photo.')).toBeTruthy();
    expect(within(form).queryByRole('img', { name: 'Photo de Amira Ben Salah' })).toBeNull();
    expect(document.activeElement).toBe(within(form).getByRole('button', { name: 'Importer une photo' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Créer le membre' }));
    await screen.findByRole('dialog', { name: 'Membre créé' });
    expect(writes()).toEqual(['POST /api/members']);
  });

  it('replaces the photo with the last one picked', async () => {
    const second = new Blob([new Uint8Array([0xff, 0xd8, 0x01, 0xff, 0xd9])], { type: 'image/jpeg' });
    renderPage();
    const form = await openForm();
    importFile(form);
    await within(form).findByText('Nouvelle photo, pas encore enregistrée.');
    vi.mocked(preparePhoto).mockResolvedValueOnce(second);
    importFile(form, new File(['other'], 'other.png', { type: 'image/png' }));
    await waitFor(() => expect(within(form).getByRole('img', { name: 'Photo de Amira Ben Salah' }).getAttribute('src')).toBe('blob:photo-2'));

    fireEvent.click(within(form).getByRole('button', { name: 'Créer le membre' }));
    await screen.findByRole('dialog', { name: 'Membre créé' });
    const sent = (requests.find((r) => r.method === 'PUT')!.body as FormData).get('photo') as File;
    expect(sent.size).toBe(second.size);
  });

  it('explains a file that is not a usable image, and keeps the form', async () => {
    vi.mocked(preparePhoto).mockRejectedValueOnce(new PhotoError('unreadable'));
    renderPage();
    const form = await openForm();
    importFile(form, new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' }));

    expect((await within(form).findByRole('alert')).textContent).toBe('Ce fichier n’est pas une image lisible. Choisissez une photo JPEG, PNG ou WebP.');
    expect(within(form).getByText('Aucune photo.')).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Créer le membre' }));
    await screen.findByRole('dialog', { name: 'Membre créé' });
    expect(writes()).toEqual(['POST /api/members']);
  });

  it('opens the camera over the form: Escape closes the camera only, the typed member stays', async () => {
    // Plain http:// (sandbox): no camera API. The dialog says so and offers the import.
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    renderPage();
    const form = await openForm();

    fireEvent.click(within(form).getByRole('button', { name: 'Prendre une photo' }));
    const camera = await screen.findByRole('dialog', { name: 'Prendre une photo' });
    expect(within(camera).getByText('Caméra indisponible')).toBeTruthy();
    expect(within(camera).getByRole('button', { name: 'Importer une photo' })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Prendre une photo' })).toBeNull());
    // Long after any closing animation, the form is still there with what was typed.
    await act(() => new Promise((resolve) => setTimeout(resolve, 800)));
    expect(screen.getByRole('dialog', { name: 'Nouveau membre' })).toBe(form);
    expect((within(form).getByLabelText('Prénom *') as HTMLInputElement).value).toBe('Amira');

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nouveau membre' })).toBeNull());
  });
});
