// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role, UserDto } from '../../api/types';
import { ConfirmProvider } from '../../components/ui/Modal';
import { ToastProvider } from '../../components/ui/Toast';
import { preparePhoto } from '../../lib/photo';
import { renderInLang } from '../../test/render';
import { TeamPage } from './TeamPage';

// jsdom cannot decode or draw an image: the preparation itself is tested in lib/photo.test.ts.
vi.mock('../../lib/photo', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/photo')>()), preparePhoto: vi.fn() }));
vi.mock('../../api/auth', () => ({ useAuth: () => ({ user: { id: 'u-admin', role: 'ADMIN' } }) }));

const UPLOADED = '/api/public/coaches/c-1/photo?v=1762160100000';
const TYPED = 'https://example.com/ines.jpg';

const account = (id: string, firstName: string, lastName: string, role: Role, avatarUrl: string | null = null, extra: Partial<UserDto> = {}): UserDto => ({
  id,
  email: `${firstName.toLowerCase()}@example.com`,
  phone: null,
  role,
  firstName,
  lastName,
  avatarUrl,
  specialty: null,
  bio: null,
  isActive: true,
  createdAt: '2026-01-05T08:00:00.000Z',
  ...extra,
});

const prepared = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9])], { type: 'image/jpeg' });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let users: UserDto[];
let requests: { method: string; path: string; body: unknown }[];
/** Answers of PUT and DELETE /api/users/:id/photo. */
let photoAnswer: (id: string) => Response;
let removeAnswer: (id: string) => Response;

const withPhoto = (id: string, avatarUrl: string | null) => {
  users = users.map((u) => (u.id === id ? { ...u, avatarUrl } : u));
  return json(200, users.find((u) => u.id === id));
};

beforeEach(() => {
  users = [
    account('u-admin', 'Nour', 'Gharbi', 'ADMIN'),
    account('c-1', 'Sami', 'Trabelsi', 'COACH', UPLOADED, { specialty: 'CrossFit' }),
    account('c-2', 'Ines', 'Mansour', 'COACH', TYPED),
    account('s-1', 'Rania', 'Ayari', 'STAFF'),
  ];
  requests = [];
  photoAnswer = (id) => withPhoto(id, `/api/public/coaches/${id}/photo?v=1762163700000`);
  removeAnswer = (id) => withPhoto(id, null);
  class TestURL extends URL {
    static createObjectURL = () => 'blob:new-photo';
    static revokeObjectURL = () => undefined;
  }
  vi.stubGlobal('URL', TestURL);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      requests.push({ method, path: url.pathname, body });
      const [, , , id, sub] = url.pathname.split('/'); // /api/users/:id/photo
      if (url.pathname === '/api/users' && method === 'GET') return json(200, users);
      if (url.pathname === '/api/users' && method === 'POST') {
        const created = account('c-9', body.firstName, body.lastName, body.role, null, { email: body.email, specialty: body.specialty, bio: body.bio });
        users = [...users, created];
        return json(201, created);
      }
      if (sub === 'photo' && method === 'PUT') return photoAnswer(id);
      if (sub === 'photo' && method === 'DELETE') return removeAnswer(id);
      if (id && !sub && method === 'PATCH') {
        users = users.map((u) => (u.id === id ? { ...u, ...body } : u));
        return json(200, users.find((u) => u.id === id));
      }
      return json(404, { statusCode: 404, message: 'Introuvable.' });
    }),
  );
  vi.mocked(preparePhoto).mockResolvedValue(prepared);
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderInLang(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <TeamPage />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const writes = () => requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`);
const sentBody = (method: string) => requests.find((r) => r.method === method)!.body as Record<string, unknown>;
const row = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLTableRowElement;

function importFile(dialog: HTMLElement) {
  const input = dialog.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['raw'], 'coach.jpg', { type: 'image/jpeg' })] } });
}

async function openNewAccount() {
  fireEvent.click(await screen.findByRole('button', { name: 'Nouveau compte' }));
  const dialog = await screen.findByRole('dialog', { name: 'Nouveau compte' });
  fireEvent.change(within(dialog).getByLabelText('Prénom *'), { target: { value: 'Yassine' } });
  fireEvent.change(within(dialog).getByLabelText('Nom de famille *'), { target: { value: 'Jaziri' } });
  fireEvent.change(within(dialog).getByLabelText('E-mail de connexion *'), { target: { value: 'yassine@example.com' } });
  fireEvent.change(within(dialog).getByLabelText('Mot de passe *'), { target: { value: 'Coach2026!' } });
  return dialog;
}

describe('team list', () => {
  it('shows the uploaded coach photo, an address typed by hand, and initials without a photo', async () => {
    renderPage();

    expect((await row('Sami Trabelsi')).querySelector('img')?.getAttribute('src')).toBe(UPLOADED);
    expect((await row('Ines Mansour')).querySelector('img')?.getAttribute('src')).toBe(TYPED);
    const staff = await row('Rania Ayari');
    expect(staff.querySelector('img')).toBeNull();
    expect(within(staff).getByText('RA')).toBeTruthy();
  });

  it('falls back to the initials when an old address no longer loads', async () => {
    renderPage();
    const ines = await row('Ines Mansour');
    fireEvent.error(ines.querySelector('img')!);
    expect(ines.querySelector('img')).toBeNull();
    expect(within(ines).getByText('IM')).toBeTruthy();
  });
});

describe('coach photo', () => {
  it('offers the photo for coaches only, and says it is public on the website', async () => {
    renderPage();
    const dialog = await openNewAccount();
    expect(within(dialog).queryByRole('button', { name: 'Prendre une photo' })).toBeNull();

    fireEvent.change(within(dialog).getByLabelText('Rôle *'), { target: { value: 'COACH' } });

    const profile = within(dialog).getByRole('group', { name: 'Profil sur le site' });
    expect(within(profile).getByText('Photo publique : tout le monde la voit sur le site, avec la spécialité et la présentation.')).toBeTruthy();
    expect(within(profile).getByRole('button', { name: 'Prendre une photo' })).toBeTruthy();
    expect(within(profile).getByRole('button', { name: 'Importer une photo' })).toBeTruthy();
    expect(within(dialog).queryByLabelText('Photo (URL)')).toBeNull();
  });

  it('uploads the photo of a new coach once the account is created', async () => {
    renderPage();
    const dialog = await openNewAccount();
    fireEvent.change(within(dialog).getByLabelText('Rôle *'), { target: { value: 'COACH' } });
    fireEvent.change(within(dialog).getByLabelText('Spécialité'), { target: { value: 'Boxe' } });
    importFile(dialog);
    expect(await within(dialog).findByText('Nouvelle photo, pas encore enregistrée.')).toBeTruthy();
    expect(writes()).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));

    expect(await screen.findByText('Compte enregistré.')).toBeTruthy();
    expect(writes()).toEqual(['POST /api/users', 'PUT /api/users/c-9/photo']);
    expect(sentBody('POST')).toMatchObject({ role: 'COACH', specialty: 'Boxe', firstName: 'Yassine' });
    expect(sentBody('POST')).not.toHaveProperty('avatarUrl');
    const sent = (sentBody('PUT') as unknown as FormData).get('photo') as File;
    expect([sent.type, sent.size]).toEqual(['image/jpeg', prepared.size]);
    // The list shows the new coach with the public photo URL the API answered.
    await waitFor(async () => expect((await row('Yassine Jaziri')).querySelector('img')?.getAttribute('src')).toBe('/api/public/coaches/c-9/photo?v=1762163700000'));
  });

  it('keeps a new coach whose photo failed, says so, and saves the photo on the next try', async () => {
    photoAnswer = () => json(400, { statusCode: 400, message: 'La photo doit être une image JPEG.' });
    renderPage();
    const dialog = await openNewAccount();
    fireEvent.change(within(dialog).getByLabelText('Rôle *'), { target: { value: 'COACH' } });
    importFile(dialog);
    await within(dialog).findByText('Nouvelle photo, pas encore enregistrée.');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe('Compte créé, mais la photo n’a pas été enregistrée : La photo doit être une image JPEG. Enregistrez à nouveau pour réessayer.');
    // The same dialog now edits the created account, the photo still waiting.
    expect(screen.getByRole('dialog', { name: 'Modifier le compte' })).toBe(dialog);
    expect(within(dialog).getByText('Nouvelle photo, pas encore enregistrée.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Nouveau mot de passe') as HTMLInputElement).value).toBe('');
    expect((within(dialog).getByLabelText('Compte actif') as HTMLInputElement).checked).toBe(true);
    expect(await row('Yassine Jaziri')).toBeTruthy();

    photoAnswer = (id) => withPhoto(id, `/api/public/coaches/${id}/photo?v=1762163700000`);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Compte enregistré.')).toBeTruthy();
    expect(writes()).toEqual(['POST /api/users', 'PUT /api/users/c-9/photo', 'PATCH /api/users/c-9', 'PUT /api/users/c-9/photo']);
    expect(sentBody('PATCH')).not.toHaveProperty('password');
    expect(sentBody('PATCH')).toMatchObject({ isActive: true });
  });

  it('removes the photo of a coach when the form is saved', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Sami Trabelsi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le compte' });
    expect(within(dialog).getByRole('img', { name: 'Photo de Sami Trabelsi' }).getAttribute('src')).toBe(UPLOADED);
    expect(within(dialog).getByText('Photo actuelle.')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer la photo' }));

    expect(within(dialog).getByText('La photo sera supprimée à l’enregistrement.')).toBeTruthy();
    expect(within(dialog).queryByRole('img', { name: 'Photo de Sami Trabelsi' })).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Importer une photo' }));
    expect(writes()).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Compte enregistré.')).toBeTruthy();
    expect(writes()).toEqual(['PATCH /api/users/c-1', 'DELETE /api/users/c-1/photo']);
    expect(sentBody('PATCH')).not.toHaveProperty('avatarUrl');
    await waitFor(async () => expect((await row('Sami Trabelsi')).querySelector('img')).toBeNull());
  });

  it('replaces an address typed by hand with an upload, and can go back to the current photo', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Ines Mansour' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le compte' });
    expect(within(dialog).getByRole('img', { name: 'Photo de Ines Mansour' }).getAttribute('src')).toBe(TYPED);

    importFile(dialog);
    await waitFor(() => expect(within(dialog).getByRole('img', { name: 'Photo de Ines Mansour' }).getAttribute('src')).toBe('blob:new-photo'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Garder la photo actuelle' }));
    expect(within(dialog).getByRole('img', { name: 'Photo de Ines Mansour' }).getAttribute('src')).toBe(TYPED);

    importFile(dialog);
    await within(dialog).findByText('Nouvelle photo, pas encore enregistrée.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Compte enregistré.')).toBeTruthy();
    expect(writes()).toEqual(['PATCH /api/users/c-2', 'PUT /api/users/c-2/photo']);
  });

  it('reports a failed removal and keeps the dialog open', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier Sami Trabelsi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le compte' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirer la photo' }));
    removeAnswer = () => json(503, { statusCode: 503, message: 'Service indisponible.' });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Compte enregistré, mais la photo n’a pas été supprimée : Service indisponible. Enregistrez à nouveau pour réessayer.',
    );
    expect(within(dialog).getByText('La photo sera supprimée à l’enregistrement.')).toBeTruthy();
    expect(writes()).toEqual(['PATCH /api/users/c-1', 'DELETE /api/users/c-1/photo']);
  });

  it('never sends a photo for an account that is not a coach', async () => {
    renderPage();
    const dialog = await openNewAccount();
    fireEvent.change(within(dialog).getByLabelText('Rôle *'), { target: { value: 'COACH' } });
    importFile(dialog);
    await within(dialog).findByText('Nouvelle photo, pas encore enregistrée.');
    fireEvent.change(within(dialog).getByLabelText('Rôle *'), { target: { value: 'STAFF' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le compte' }));

    expect(await screen.findByText('Compte enregistré.')).toBeTruthy();
    expect(writes()).toEqual(['POST /api/users']);
    expect(sentBody('POST')).not.toHaveProperty('specialty');
  });
});
