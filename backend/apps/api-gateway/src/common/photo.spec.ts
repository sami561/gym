import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { IncomingHttpHeaders, request } from 'http';
import { AddressInfo } from 'net';
import { AuthGuard, PATTERNS, PHOTO_MAX_BYTES, Role, RpcClient, RpcError, StoredPhoto } from '@app/common';
import { HttpThrottlerGuard } from './http-throttler.guard';
import { RpcToHttpFilter } from './rpc-to-http.filter';
import { createValidationPipe } from './validation';
import { MeController } from '../me/me.controller';
import { MembersController } from '../members/members.controller';
import { PublicController } from '../public/public.controller';
import { UsersController } from '../users/users.controller';
import { etagMatches, photoEtag } from './photo';

jest.mock('dotenv', () => ({ config: jest.fn() }));

const ACCESS_SECRET = 'spec-access-secret-0123456789abcdef0123456789';
const MEMBER_ID = '0b9a2c6e-6f1d-4c39-9a51-3d2f8e7c1a01';
const STAFF_ID = '5d1c7c1e-2f43-4f0e-9a51-3d2f8e7c1a02';
const COACH_ID = '3c5e8a52-4f0e-4c1e-9b7a-0a1b2c3d4e05';
const COACH_PHOTO_URL = `/api/public/coaches/${COACH_ID}/photo?v=1793782800000`;
const MISSING = 'Ajoutez une photo (champ « photo »).';
const TOO_LARGE = 'La photo dépasse 512 Ko.';
/** Any bytes: the gateway forwards them, membership-service checks the JPEG. */
const PHOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 0x42), Buffer.from([0xff, 0xd9])]);
const STORED: StoredPhoto = { data: PHOTO.toString('base64'), contentType: 'image/jpeg', updatedAt: '2026-11-03T09:00:00.000Z' };

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  json: { statusCode?: number; message?: unknown; id?: string };
}

describe('photo routes (gateway over HTTP: guards, multer, filters)', () => {
  const rpc = { send: jest.fn() };
  const jwt = new JwtService();
  let app: NestExpressApplication;
  let port: number;

  const token = (sub: string, role: Role) =>
    jwt.sign({ sub, role, email: `${sub.slice(0, 8)}@example.com`, name: 'Test', type: 'access' }, { secret: ACCESS_SECRET, expiresIn: 900 });
  const staff = token(STAFF_ID, Role.STAFF);
  const admin = token('9e1c7c1e-2f43-4f0e-9a51-3d2f8e7c1a03', Role.ADMIN);
  const memberToken = token(MEMBER_ID, Role.MEMBER);
  const coachToken = token(COACH_ID, Role.COACH);

  function call(method: string, path: string, options: { auth?: string; headers?: Record<string, string>; body?: Buffer } = {}) {
    return new Promise<Reply>((resolve, reject) => {
      const headers: Record<string, string> = { ...options.headers };
      if (options.auth) headers.authorization = `Bearer ${options.auth}`;
      if (options.body) headers['content-length'] = String(options.body.length);
      const req = request({ host: '127.0.0.1', port, method, path: `/api${path}`, headers, agent: false }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const json = String(res.headers['content-type']).includes('json') ? (JSON.parse(body.toString()) as Reply['json']) : {};
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json });
        });
      });
      req.on('error', reject);
      req.end(options.body);
    });
  }

  /** multipart/form-data body; a part with a filename is a file. */
  function form(...parts: { name: string; data: Buffer | string; filename?: string; type?: string }[]) {
    const boundary = 'meliora-spec-boundary';
    const body = Buffer.concat([
      ...parts.flatMap((part) => [
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"` +
            (part.filename ? `; filename="${part.filename}"` : '') +
            `\r\n${part.type ? `Content-Type: ${part.type}\r\n` : ''}\r\n`,
        ),
        Buffer.from(part.data),
        Buffer.from('\r\n'),
      ]),
      Buffer.from(`--${boundary}--\r\n`),
    ]);
    return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  }
  const photoForm = (data: Buffer = PHOTO) => form({ name: 'photo', data, filename: 'photo.jpg', type: 'image/jpeg' });
  const upload = (path: string, auth: string, data?: Buffer) => call('PUT', path, { auth, ...photoForm(data) });

  const memberDto = (id: string, photoUpdatedAt: string | null) => ({ id, memberCode: 'MEL-00042', photoUpdatedAt });
  const userDto = (id: string, avatarUrl: string | null) => ({ id, role: Role.COACH, firstName: 'Leila', avatarUrl });

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({}), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [MembersController, MeController, UsersController, PublicController],
      providers: [
        { provide: RpcClient, useValue: rpc },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: HttpThrottlerGuard },
      ],
    }).compile();
    // As in main.ts
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new RpcToHttpFilter());
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    rpc.send.mockReset();
    rpc.send.mockImplementation(async (pattern: string, payload: { id: string }) => {
      if (pattern === PATTERNS.members.photoGet) return STORED;
      if (pattern === PATTERNS.members.photoSet) return memberDto(payload.id, '2026-11-03T09:00:00.000Z');
      if (pattern === PATTERNS.members.photoRemove) return memberDto(payload.id, null);
      if (pattern === PATTERNS.users.photoGet) return STORED;
      if (pattern === PATTERNS.users.photoSet) return userDto(payload.id, COACH_PHOTO_URL);
      if (pattern === PATTERNS.users.photoRemove) return userDto(payload.id, null);
      if (pattern === PATTERNS.users.update) return userDto(payload.id, null);
      throw new Error(`unexpected ${pattern}`);
    });
  });

  describe('PUT /api/members/:id/photo', () => {
    it('forwards the file in base64 to membership-service and answers its MemberDto', async () => {
      const res = await upload(`/members/${MEMBER_ID}/photo`, staff);
      expect(res.status).toBe(200);
      expect(res.json).toEqual(memberDto(MEMBER_ID, '2026-11-03T09:00:00.000Z'));
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.members.photoSet, { id: MEMBER_ID, data: PHOTO.toString('base64') });
    });

    it('400 Ajoutez une photo without a file in the field photo', async () => {
      const cases = [
        { 'content-type': 'application/json', body: Buffer.from(JSON.stringify({ photo: PHOTO.toString('base64') })) },
        { 'content-type': 'image/jpeg', body: PHOTO },
        { ...form({ name: 'note', data: 'profil' }).headers, body: form({ name: 'note', data: 'profil' }).body },
        { ...form({ name: 'file', data: PHOTO, filename: 'photo.jpg' }).headers, body: form({ name: 'file', data: PHOTO, filename: 'photo.jpg' }).body },
        { ...form({ name: 'photo', data: 'texte' }).headers, body: form({ name: 'photo', data: 'texte' }).body },
        { ...photoForm(Buffer.alloc(0)).headers, body: photoForm(Buffer.alloc(0)).body },
      ];
      for (const { body, ...headers } of cases) {
        const res = await call('PUT', `/members/${MEMBER_ID}/photo`, { auth: staff, headers, body });
        expect({ status: res.status, message: res.json.message }).toEqual({ status: 400, message: MISSING });
      }
      expect(rpc.send).not.toHaveBeenCalled();
    });

    it('400 for two files or a broken multipart body', async () => {
      const two = form(
        { name: 'photo', data: PHOTO, filename: 'a.jpg' },
        { name: 'photo', data: PHOTO, filename: 'b.jpg' },
      );
      const cut = photoForm();
      const broken = [
        two,
        { headers: cut.headers, body: cut.body.subarray(0, cut.body.length - 30) },
        { headers: { 'content-type': 'multipart/form-data' }, body: cut.body },
        { headers: { 'content-type': 'multipart/mixed; boundary=x' }, body: Buffer.from('--x--\r\n') },
      ];
      for (const { headers, body } of broken) {
        const res = await call('PUT', `/members/${MEMBER_ID}/photo`, { auth: staff, headers, body });
        expect({ status: res.status, message: res.json.message }).toEqual({ status: 400, message: MISSING });
      }
      expect(rpc.send).not.toHaveBeenCalled();
    });

    it('413 La photo dépasse 512 Ko above the limit without calling the service; 512 KB exactly is forwarded', async () => {
      const over = await upload(`/members/${MEMBER_ID}/photo`, staff, Buffer.alloc(PHOTO_MAX_BYTES + 1, 0xff));
      expect(over.status).toBe(413);
      expect(over.json).toMatchObject({ statusCode: 413, message: TOO_LARGE });
      expect(rpc.send).not.toHaveBeenCalled();

      const limit = Buffer.alloc(PHOTO_MAX_BYTES, 0xff);
      expect((await upload(`/members/${MEMBER_ID}/photo`, staff, limit)).status).toBe(200);
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.members.photoSet, { id: MEMBER_ID, data: limit.toString('base64') });
    });

    it('relays the refusals of membership-service (not a JPEG, unknown member) with their status', async () => {
      rpc.send.mockRejectedValueOnce(new RpcError(400, 'La photo doit être une image JPEG.', PATTERNS.members.photoSet));
      const png = await upload(`/members/${MEMBER_ID}/photo`, staff, Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'));
      expect(png.json).toEqual({ statusCode: 400, message: 'La photo doit être une image JPEG.' });

      rpc.send.mockRejectedValueOnce(new RpcError(404, 'Membre introuvable.', PATTERNS.members.photoSet));
      const unknown = await upload(`/members/${MEMBER_ID}/photo`, staff);
      expect(unknown.json).toEqual({ statusCode: 404, message: 'Membre introuvable.' });
    });

    it('400 for an id that is not a UUID', async () => {
      expect((await upload('/members/42/photo', staff)).status).toBe(400);
      expect(rpc.send).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/members/:id/photo', () => {
    it('serves the JPEG, cached for a year with ?v=, revalidated without, always with an ETag', async () => {
      const versioned = await call('GET', `/members/${MEMBER_ID}/photo?v=1793782800000`, { auth: staff });
      expect(versioned.status).toBe(200);
      expect(versioned.headers['content-type']).toBe('image/jpeg');
      expect(versioned.headers['content-length']).toBe(String(PHOTO.length));
      expect(versioned.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(versioned.headers.etag).toBe(photoEtag(PHOTO));
      expect(versioned.body).toEqual(PHOTO);
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.members.photoGet, { id: MEMBER_ID });

      const latest = await call('GET', `/members/${MEMBER_ID}/photo`, { auth: staff });
      expect(latest.headers['cache-control']).toBe('private, no-cache');
      expect(latest.headers.etag).toBe(versioned.headers.etag);
      expect(latest.body).toEqual(PHOTO);
      expect((await call('GET', `/members/${MEMBER_ID}/photo?v=`, { auth: staff })).headers['cache-control']).toBe('private, no-cache');
    });

    it('304 without body when If-None-Match names the ETag (weak form and lists too)', async () => {
      const etag = photoEtag(PHOTO);
      for (const ifNoneMatch of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
        const res = await call('GET', `/members/${MEMBER_ID}/photo?v=1`, { auth: staff, headers: { 'if-none-match': ifNoneMatch } });
        expect(res.status).toBe(304);
        expect(res.body.length).toBe(0);
        expect(res.headers.etag).toBe(etag);
        expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      }
      const changed = await call('GET', `/members/${MEMBER_ID}/photo`, { auth: staff, headers: { 'if-none-match': '"previous"' } });
      expect(changed.status).toBe(200);
      expect(changed.body).toEqual(PHOTO);
    });

    it('404 as JSON, without the photo cache headers, for a member without photo or an unknown member', async () => {
      for (const message of ['Aucune photo.', 'Membre introuvable.']) {
        rpc.send.mockRejectedValueOnce(new RpcError(404, message, PATTERNS.members.photoGet));
        const res = await call('GET', `/members/${MEMBER_ID}/photo?v=1`, { auth: staff });
        expect(res.status).toBe(404);
        expect(res.json).toEqual({ statusCode: 404, message });
        expect(res.headers['cache-control']).toBeUndefined();
        // (Express puts its own weak ETag on every JSON answer)
        expect(res.headers.etag).not.toBe(photoEtag(PHOTO));
      }
    });
  });

  it('DELETE /api/members/:id/photo answers the MemberDto without photo', async () => {
    const res = await call('DELETE', `/members/${MEMBER_ID}/photo`, { auth: admin });
    expect(res.json).toEqual(memberDto(MEMBER_ID, null));
    expect(rpc.send).toHaveBeenCalledWith(PATTERNS.members.photoRemove, { id: MEMBER_ID });
  });

  describe('/api/me/photo (role MEMBER)', () => {
    it('always works on the photo of the signed-in member', async () => {
      const put = await upload('/me/photo', memberToken);
      expect(put.json).toEqual(memberDto(MEMBER_ID, '2026-11-03T09:00:00.000Z'));
      const get = await call('GET', '/me/photo?v=1793782800000', { auth: memberToken });
      expect(get.status).toBe(200);
      expect(get.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(get.body).toEqual(PHOTO);
      const del = await call('DELETE', '/me/photo', { auth: memberToken });
      expect(del.json).toEqual(memberDto(MEMBER_ID, null));
      expect(rpc.send.mock.calls).toEqual([
        [PATTERNS.members.photoSet, { id: MEMBER_ID, data: PHOTO.toString('base64') }],
        [PATTERNS.members.photoGet, { id: MEMBER_ID }],
        [PATTERNS.members.photoRemove, { id: MEMBER_ID }],
      ]);
    });

    it('same refusals as the staff route', async () => {
      const over = await upload('/me/photo', memberToken, Buffer.alloc(PHOTO_MAX_BYTES + 1));
      expect({ status: over.status, message: over.json.message }).toEqual({ status: 413, message: TOO_LARGE });
      const none = await call('PUT', '/me/photo', { auth: memberToken, ...form({ name: 'avatar', data: PHOTO, filename: 'a.jpg' }) });
      expect({ status: none.status, message: none.json.message }).toEqual({ status: 400, message: MISSING });
    });

    it('accepts 10 uploads a minute per member: the 11th is refused (429) before its body is read', async () => {
      const busy = token('7f2c7c1e-2f43-4f0e-9a51-3d2f8e7c1a04', Role.MEMBER);
      for (let i = 0; i < 10; i++) expect((await upload('/me/photo', busy)).status).toBe(200);
      rpc.send.mockClear();
      const res = await upload('/me/photo', busy);
      expect(res.status).toBe(429);
      expect(rpc.send).not.toHaveBeenCalled();
      // other members are counted apart
      expect((await upload('/me/photo', memberToken)).status).toBe(200);
    });
  });

  describe('PUT /api/users/:id/photo (coach photo, ADMIN)', () => {
    it('forwards the file in base64 to auth-service and answers its UserDto', async () => {
      const res = await upload(`/users/${COACH_ID}/photo`, admin);
      expect(res.status).toBe(200);
      expect(res.json).toEqual(userDto(COACH_ID, COACH_PHOTO_URL));
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.users.photoSet, { id: COACH_ID, data: PHOTO.toString('base64') });
    });

    it('same upload refusals as the member photos, without calling the service', async () => {
      const none = await call('PUT', `/users/${COACH_ID}/photo`, { auth: admin, ...form({ name: 'avatar', data: PHOTO, filename: 'a.jpg' }) });
      expect({ status: none.status, message: none.json.message }).toEqual({ status: 400, message: MISSING });
      const json = await call('PUT', `/users/${COACH_ID}/photo`, {
        auth: admin,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ photo: PHOTO.toString('base64') })),
      });
      expect({ status: json.status, message: json.json.message }).toEqual({ status: 400, message: MISSING });
      const empty = await upload(`/users/${COACH_ID}/photo`, admin, Buffer.alloc(0));
      expect({ status: empty.status, message: empty.json.message }).toEqual({ status: 400, message: MISSING });
      const over = await upload(`/users/${COACH_ID}/photo`, admin, Buffer.alloc(PHOTO_MAX_BYTES + 1, 0xff));
      expect({ status: over.status, message: over.json.message }).toEqual({ status: 413, message: TOO_LARGE });
      expect((await upload('/users/42/photo', admin)).status).toBe(400);
      expect(rpc.send).not.toHaveBeenCalled();
    });

    it('relays the refusals of auth-service: not a JPEG, not a coach, unknown user', async () => {
      for (const [status, message] of [
        [400, 'La photo doit être une image JPEG.'],
        [400, 'Seuls les coachs ont une photo sur le site.'],
        [404, 'Utilisateur introuvable.'],
      ] as const) {
        rpc.send.mockRejectedValueOnce(new RpcError(status, message, PATTERNS.users.photoSet));
        const res = await upload(`/users/${COACH_ID}/photo`, admin);
        expect(res.status).toBe(status);
        expect(res.json).toEqual({ statusCode: status, message });
      }
    });
  });

  it('DELETE /api/users/:id/photo answers the UserDto without avatarUrl', async () => {
    const res = await call('DELETE', `/users/${COACH_ID}/photo`, { auth: admin });
    expect(res.status).toBe(200);
    expect(res.json).toEqual(userDto(COACH_ID, null));
    expect(rpc.send).toHaveBeenCalledWith(PATTERNS.users.photoRemove, { id: COACH_ID });
  });

  describe('GET /api/public/coaches/:id/photo (website, no token)', () => {
    it('serves the JPEG to anyone: public cache for a year with ?v=, revalidated without, always with an ETag', async () => {
      const versioned = await call('GET', `/public/coaches/${COACH_ID}/photo?v=1793782800000`);
      expect(versioned.status).toBe(200);
      expect(versioned.headers['content-type']).toBe('image/jpeg');
      expect(versioned.headers['content-length']).toBe(String(PHOTO.length));
      expect(versioned.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(versioned.headers.etag).toBe(photoEtag(PHOTO));
      expect(versioned.body).toEqual(PHOTO);
      expect(rpc.send).toHaveBeenCalledWith(PATTERNS.users.photoGet, { id: COACH_ID });

      const latest = await call('GET', `/public/coaches/${COACH_ID}/photo`);
      expect(latest.status).toBe(200);
      expect(latest.headers['cache-control']).toBe('public, no-cache');
      expect(latest.headers.etag).toBe(versioned.headers.etag);
      expect(latest.body).toEqual(PHOTO);
      // a token is not needed, and does not change the answer
      const signedIn = await call('GET', `/public/coaches/${COACH_ID}/photo?v=1`, { auth: memberToken });
      expect(signedIn.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('304 without body when If-None-Match names the ETag', async () => {
      const etag = photoEtag(PHOTO);
      for (const ifNoneMatch of [etag, `W/${etag}`, '*']) {
        const res = await call('GET', `/public/coaches/${COACH_ID}/photo?v=1`, { headers: { 'if-none-match': ifNoneMatch } });
        expect(res.status).toBe(304);
        expect(res.body.length).toBe(0);
        expect(res.headers.etag).toBe(etag);
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      }
      const changed = await call('GET', `/public/coaches/${COACH_ID}/photo`, { headers: { 'if-none-match': '"previous"' } });
      expect(changed.status).toBe(200);
    });

    it('404 Aucune photo as JSON, without the photo cache headers (no photo, demoted or deactivated coach)', async () => {
      rpc.send.mockRejectedValueOnce(new RpcError(404, 'Aucune photo.', PATTERNS.users.photoGet));
      const res = await call('GET', `/public/coaches/${COACH_ID}/photo?v=1`);
      expect(res.status).toBe(404);
      expect(res.json).toEqual({ statusCode: 404, message: 'Aucune photo.' });
      expect(res.headers['cache-control']).toBeUndefined();
    });

    it('400 for an id that is not a UUID', async () => {
      expect((await call('GET', '/public/coaches/42/photo')).status).toBe(400);
      expect(rpc.send).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/users/:id avatarUrl', () => {
    const patch = (avatarUrl: unknown) =>
      call('PATCH', `/users/${COACH_ID}`, {
        auth: admin,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ avatarUrl })),
      });

    it('takes a URL typed by hand, null, or the coach photo URL the back-office loaded', async () => {
      for (const avatarUrl of ['https://cdn.example.com/leila.jpg', null, COACH_PHOTO_URL, `/api/public/coaches/${COACH_ID}/photo`]) {
        expect((await patch(avatarUrl)).status).toBe(200);
        expect(rpc.send).toHaveBeenLastCalledWith(PATTERNS.users.update, { id: COACH_ID, data: { avatarUrl } });
      }
    });

    it('refuses other relative paths and non-text values', async () => {
      for (const avatarUrl of ['/api/members/x/photo', `/api/public/coaches/${COACH_ID}/photo?v=1&x=2`, 'pas une url', 42]) {
        expect([avatarUrl, (await patch(avatarUrl)).status]).toEqual([avatarUrl, 400]);
      }
      expect(rpc.send).not.toHaveBeenCalled();
    });
  });

  describe('permissions', () => {
    it('staff routes: 401 without token, 403 for a member; ADMIN and STAFF allowed', async () => {
      const path = `/members/${MEMBER_ID}/photo`;
      expect((await call('GET', path)).status).toBe(401);
      expect((await upload(path, '')).status).toBe(401);
      for (const [method, run] of [
        ['GET', () => call('GET', path, { auth: memberToken })],
        ['PUT', () => upload(path, memberToken)],
        ['DELETE', () => call('DELETE', path, { auth: memberToken })],
      ] as const) {
        expect([method, (await run()).status]).toEqual([method, 403]);
      }
      expect(rpc.send).not.toHaveBeenCalled();
      expect((await call('GET', path, { auth: admin })).status).toBe(200);
      expect((await call('GET', path, { auth: staff })).status).toBe(200);
    });

    it('coach photo upload and removal: ADMIN only (401 without token, 403 for STAFF, COACH and MEMBER)', async () => {
      const path = `/users/${COACH_ID}/photo`;
      expect((await upload(path, '')).status).toBe(401);
      expect((await call('DELETE', path)).status).toBe(401);
      for (const auth of [staff, coachToken, memberToken]) {
        expect((await upload(path, auth)).status).toBe(403);
        expect((await call('DELETE', path, { auth })).status).toBe(403);
      }
      expect(rpc.send).not.toHaveBeenCalled();
    });

    it('/api/me/photo: 401 without token, 403 for staff (a member only manages their own photo)', async () => {
      expect((await call('GET', '/me/photo')).status).toBe(401);
      expect((await call('GET', '/me/photo', { auth: staff })).status).toBe(403);
      expect((await upload('/me/photo', admin)).status).toBe(403);
      expect((await call('DELETE', '/me/photo', { auth: staff })).status).toBe(403);
      expect(rpc.send).not.toHaveBeenCalled();
    });
  });
});

describe('etagMatches (If-None-Match)', () => {
  it('compares weakly and reads lists', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x" , W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
    expect(etagMatches('"abcd"', '"abc"')).toBe(false);
    expect(etagMatches('abc', '"abc"')).toBe(false);
    expect(etagMatches(undefined, '"abc"')).toBe(false);
    expect(etagMatches('', '"abc"')).toBe(false);
  });
});
