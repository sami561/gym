# Web (public site + back office)

One Vite app: `/` is the public site (`src/landing/`), `/admin` the staff back office (`src/admin/`,
lazy-loaded with its own dictionary). Background and structure: `README.md`.

- API: `src/api/client.ts` (access token in memory, refresh token in localStorage, or in memory for
  the tab when storage is blocked; single-flight refresh — refresh tokens rotate, always keep the
  newest), `endpoints*.ts`, and `types*.ts`, which mirror `backend/libs/common/src/contracts`
  **by hand**: change them with the contract and `docs/API.md`. A refresh answer is ignored if the
  stored refresh token changed while it ran (sign-out, sign-in, password change, another tab), and
  the request waiting on it is not replayed under the new session.
- i18n: public site uses keyed dictionaries (`src/i18n/landing.ts`); the back office uses the French
  text as the key with `{ en, ar }` in `src/i18n/messages/admin.ts` — `t()` only accepts known keys,
  so a missing translation is a type error. Last-name fields use the key `'Nom de famille'`
  (Last name / اللقب); `'Nom'` is the generic name (door agent, room, workflow, full-name
  column) — `src/i18n/dictionaries.test.ts` checks every back-office lastName field. Arabic is
  RTL: use logical classes (`ms/me`, `ps/pe`, `start/end`, `text-start`), Latin digits, money and
  dates through `src/lib/format.ts`.
- Charts (`src/admin/charts/`): dataviz rules — validated palette slots, table view on every chart,
  no dual axis.
- Member photos (`src/admin/photos/`, `src/lib/photo.ts`, `src/lib/camera.ts`): never an `<img src>`
  to the API. `MemberAvatar` fetches the JPEG with the token (`apiBlob`, `cache: 'no-store'`: never in
  the browser's disk cache) into the react-query cache (`memberPhotoKey`, emptied at sign-out by
  `api/queryClient.ts`) and shows it through an object URL it revokes, else initials. `photoUpdatedAt`
  null = no request, an ISO = `?v=` (immutable), undefined = latest (access logs, scanner; 404 =
  none). Uploads go through `preparePhoto` / `captureFrame` (upright, centre square, 600×600 JPEG
  ≤ 512 KB) as the multipart field `photo` (`api()` sends a `FormData` as is). The webcam needs
  https or localhost.
- The three.js ceiling (`src/landing/three/`) stays lazy, paused off-screen, with the static fallback.
- Use the gym's real photos in `public/images/` (copies of `assets/images/`); don't invent visuals.
- Tests: Vitest, `*.test.ts(x)` next to the code. DOM tests opt into jsdom with a docblock and
  render through `renderInLang` (`src/test/`). The config pins `TZ=Africa/Tunis`, where device time
  and gym time agree: a test of gym-time code (`src/lib/gymTime.ts`, the public site) moves the device
  with `vi.stubEnv('TZ', 'America/Toronto')`, or it would pass with device-local code too. Never hit the
  network (stub `fetch` / `localStorage` with `vi.stubGlobal`); normalise raw Intl output instead of
  asserting ICU spacing. New label maps go into `LABEL_MAPS` in `src/lib/labels-ops.test.ts`, which
  checks them against the backend enums. Skipped tests pin known bugs — unskip them with the fix.

```bash
npm run dev          # :5173, proxies /api and /socket.io to VITE_PROXY_TARGET (gateway :4000)
npm test && npm run typecheck && npm run lint && npm run build
```
