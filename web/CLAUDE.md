# Web (public site + back office)

One Vite app: `/` is the public site (`src/landing/`), `/admin` the staff back office (`src/admin/`,
lazy-loaded with its own dictionary). Background and structure: `README.md`.

- API: `src/api/client.ts` (access token in memory, refresh token in localStorage, single-flight
  refresh — refresh tokens rotate, always keep the newest), `endpoints*.ts`, and `types*.ts`, which
  mirror `backend/libs/common/src/contracts` **by hand**: change them with the contract and `docs/API.md`.
- i18n: public site uses keyed dictionaries (`src/i18n/landing.ts`); the back office uses the French
  text as the key with `{ en, ar }` in `src/i18n/messages/admin.ts` — `t()` only accepts known keys,
  so a missing translation is a type error. Arabic is RTL: use logical classes (`ms/me`, `ps/pe`,
  `start/end`, `text-start`), Latin digits, money and dates through `src/lib/format.ts`.
- Charts (`src/admin/charts/`): dataviz rules — validated palette slots, table view on every chart,
  no dual axis.
- The three.js ceiling (`src/landing/three/`) stays lazy, paused off-screen, with the static fallback.
- Use the gym's real photos in `public/images/` (copies of `assets/images/`); don't invent visuals.

```bash
npm run dev          # :5173, proxies /api and /socket.io to VITE_PROXY_TARGET (gateway :4000)
npm run typecheck && npm run lint && npm run build
```
