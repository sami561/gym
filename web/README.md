# Meliora Gym — web

Public website and staff back office for Meliora Gym (Khzema Est, Sousse), in one React app.

- `/` — the public site: 3D hexagon-ceiling hero, spaces, plans, weekly schedule, coaches, the member app, free-trial form, location and hours.
- `/admin` — the back office for reception, coaches and the owner: dashboard, members, leads, classes and bookings, training, doors and the QR scanner, tasks and workflows, shop, rooms and equipment, staff (HR, payroll, team calendar), payments, expenses, performance (GMV/NMV/margins), promo codes, plans and staff accounts.

Stack: React 19, Vite 6, TypeScript, Tailwind CSS 4, React Router 7, TanStack Query 5, Recharts 3, React Flow (`@xyflow/react`), three.js with `@react-three/fiber`/`drei`, `motion`, socket.io-client, html5-qrcode.

## Run it

```bash
npm install
cp .env.example .env      # optional: defaults work with the local gateway
npm run dev               # http://localhost:5173
```

The dev server proxies `/api` and `/socket.io` to the NestJS gateway (`VITE_PROXY_TARGET`, default `http://localhost:4000`), so the backend must be running.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | type-check (`tsc -b`) and production build into `dist/` |
| `npm run preview` | serve the production build on port 4173 |
| `npm run lint` | ESLint |

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | empty (same origin) | gateway base URL baked into the build; leave empty behind nginx or the dev proxy |
| `VITE_PROXY_TARGET` | `http://localhost:4000` | where the dev server proxies `/api` and `/socket.io` |
| `VITE_APP_STORE_URL`, `VITE_PLAY_STORE_URL` | empty | store badges on the landing page once the app is published |

### Docker

`Dockerfile` builds the app with Node 20 and serves `dist/` with nginx. `nginx.conf` adds an SPA fallback, long caching for hashed assets, and gzip. It also reverse-proxies `/api/`, `/docs`, `/socket.io/` and `/agent-socket` (with WebSocket upgrade) to the `api-gateway:4000` service. The root `docker-compose.yml` builds it with `build: ./web` and maps port `8080:80`.

## Structure

```
src/
  api/            fetch client (tokens, single-flight refresh), endpoints, typed contracts, live socket
  i18n/           FR / EN / AR: provider, switcher, landing dictionary, back-office messages
  components/ui/  buttons, fields, modal + confirm, toasts, data table, tabs, form builder (FormModal)
  landing/        public site sections and the three.js ceiling (lazy loaded)
  admin/          AdminApp (lazy chunk: routes + dictionary), layout, nav, charts, pages/*
  lib/            locale-aware formatters, enum labels, theme
```

Typed API contracts mirror `backend/libs/common/src/contracts` by hand (`src/api/types.ts`, `src/api/types-ops.ts`); the HTTP contract is `docs/API.md`.

## Languages: French, English, Arabic (RTL)

- One i18n layer for both sites: `useI18n()` gives `t`, `lang`, `dir` and `setLang`. The language comes from `localStorage`, then the browser, and defaults to French. Changing it updates `<html lang dir>`.
- Public site: keyed dictionaries (`src/i18n/landing.ts`, keys like `hero.title1`).
- Back office: **the French text is the key** (`t('Membres actifs')`), with `{ en, ar }` entries in `src/i18n/messages/admin.ts`. `t()` only accepts known keys, so a missing translation is a type error. Use `{placeholders}`: `t('{n} jours', { n })`.
- `FormModal` field labels and hints, `DataTable` headers and `Tabs` labels are keys and get translated automatically.
- Arabic uses Cairo with no letter-spacing and logical CSS (`ms/me`, `ps/pe`, `start/end`, `text-start`), and the chevrons are mirrored. Charts and the shift timeline keep a left-to-right time axis.
- Dates, weekdays, relative times and money (`DT` / `د.ت`) follow the language through `src/lib/format.ts`, always with Latin digits. Error messages from the server stay in French.

## Design notes

- Brand from the gym itself: shield black, corrugated-steel greys (facade), LED white (hexagon ceiling), hammer red. Archivo at its widest for display type (like the facade lettering), normal width for text.
- The hero recreates the hexagon LED ceiling in three.js. The tubes light up like fluorescent lamps and follow the pointer. The scene is lazy-loaded, its DPR is capped, it pauses when off-screen, and it falls back to a static image for reduced motion or when WebGL is missing.
- Charts follow the dataviz rules: categorical slots 1–3 (blue, orange, aqua) and the employee-position slots 1–6 were checked with the palette validator in both themes. Age groups use an ordinal blue ramp. Every chart has a table view, there is no dual axis, and margin % gets its own chart.
- The back office has dark (default) and light themes, switched from the top bar.

## Auth and security

- Access token in memory, refresh token in `localStorage`, or in memory for the tab when the browser blocks storage. On a 401 the client refreshes once (single-flight), and refresh tokens rotate, so the newest one is always saved.
- A refresh answer is ignored if the stored refresh token changed while it ran (sign-out, sign-in, password change, another tab), and the request waiting on it is not replayed under the new session.
- Changing the password (key icon in the top bar) signs out every other session and stores the fresh tokens.
- The live feed refreshes the token and reconnects after the server drops the socket when the token expires. If the refresh fails but keeps the session (server down, rate limit, no network), the feed stays offline and tries again after 2 s, doubling the wait up to 60 s. It stops on sign-out.
- Door secrets come back masked (`********`). Leaving a secret field empty keeps the stored value.
