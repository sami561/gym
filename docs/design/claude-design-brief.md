# Meliora Gym: design brief for every interface

## 0. Goal, context and how to work

Design every interface of the Meliora Gym platform as one coherent system that is ready to implement. Meliora Gym is an independent gym in Khzema Est, Sousse, Tunisia. "Meliora" is Latin for "ever better". The emblem is an athlete carving his own statue with a hammer and chisel. The platform already runs in code (NestJS services, a React web app, an Expo app and n8n e-mails). Design the real screens, the real French copy and the real states listed here, not a concept.

The platform serves members, reception staff («Accueil»), coaches and the owner, plus prospects who find the gym on the website. It has four surfaces:
- a public website (always dark)
- an admin back-office (dark by default, with a light theme)
- a member app for iOS and Android (dark only, phone portrait)
- transactional e-mails (light, 600 px, French only)

The website, back-office and app run in French (the default), English and Arabic. Arabic gets full right-to-left mirroring.

**How to work**
- Work in passes, and stop after each pass for my review:
  0. **Plan.** Before drawing anything, reply with a one-page plan. It should cover 4–6 core hex colours, the type roles, and ASCII wireframes for APP-05, ADM-03 and WEB-02. It should also list anything that reads like a generic dark fitness or SaaS template, and what you changed to avoid it.
  1. **Design system (§2):**
     - foundations: colour, type (with Arabic specimens), spacing, radii, elevation, motion specs, icons, brand devices, and the logo do's and don'ts
     - every component with all its variants and states
     - the status table, the chart kit, and a table of formats and copy
  2. **Member app (§5):** every APP screen and state, plus a clickable prototype: Sign in → Home → Classes → Class detail (pick a spot, book) → Pass → Door (granted and denied).
  3. **Back-office (§6):** the shell and every ADM screen in sidebar order. Place modals and drawers next to their page, and include the role variants.
  4. **Website (§7):** every WEB section, the full page at each breakpoint, and the hero prototype.
  5. **E-mails (§8).**
  6. **Proposals (§10).** Optional, and only after passes 1–5.
  7. **Handoff (§11).**
- Read §0–4, §9, §11 and §12 before pass 1. Read each surface's own section at the start of its pass.
- Keep everything in one file built on shared components, so that one token change updates every screen.
- **Frame budget:** when a state changes only one block (loading, empty, error, a banner), draw that block next to the full frame. Don't draw a full-screen copy for it.

**How to read this brief**
- «Text in guillemets» is the exact French UI string: the copy from the code plus the changes this brief makes. Use it word for word. Some strings contain « » of their own.
- Each pair of guillemets is one string, so option sets appear as separate strings: «Tous» «Actifs» «Expirés» «Suspendus». A «·» inside one pair is part of the copy: «Réservé · Place n°7».
- «A» — «B» means a title A with the description B under it. The dash itself is not copy.
- `{single braces}` are placeholders; fill them from §3. `{{double braces}}` are literal text that appears in the UI (in the workflow editor).
- Strings are written in sentence case. Uppercase only ever comes from a type style (overline, large button), never from the string itself.
- Apostrophes are typographic (’) everywhere. The web, landing and door-reason strings already use ’. The app and push strings still use ' in code and will switch to ’.
- IDs such as `APP-15`, `ADM-29`, `WEB-02` and `EML-03` name the screens. Use them in frame names.
- Markers:
  - ★ marks a bold moment and ◆ a precision moment (§4).
  - **Change** marks a deliberate difference from today's code.
  - **Proposal** marks something the code doesn't have yet. Design proposals only in pass 6, on their own page.

## 1. Reference material

**Photos.** Four photos are attached to this message. They come from `assets/images/` in the repo, and copies live in `mobile/assets/images/` and `web/public/images/`. If any of them is missing, ask for it before you start. These are the only photos you may use.

| File | Size | What it shows | Where it is used |
|---|---|---|---|
| `logo.jpg` | 150×150 JPEG on white | A black heraldic shield. A long-haired, muscular athlete raises a **red hammer** and holds a **red chisel**, carving his own lower body out of stone. The hammer breaks out over the top edge of the shield. Below is the wordmark **MELIORA** in a heavy, extended, squared "techno" face with rounded corners: the E is three bars with no spine, and the O is a rounded rectangle. A smaller black **GYM** sits between two thin red rules. | Always used unaltered, on a white rounded tile (§2.8) |
| `facade.jpg` | 765×1020 | The building on Rue Colonel Garnaoui. Dark steel-grey corrugated cladding (#5C646A–#70767E) carries raised silver-white "MELIORA GYM" letters in the same extended face. There are thin white LED strips along the bands, a ribbon of reflective glass, grey composite panels and dark glass shopfronts at street level, under a blue sky. | App sign-in and register hero, back-office login, website location section |
| `shield-sign.jpg` | 765×1020 | The illuminated shield lightbox: white rim, black field, white figure, and a red hammer and chisel (#CB1C2F when lit). It is the "night" version of the logo. | App membership card, website About section, any large brand moment |
| `interior.jpg` | 141×235 (tiny) | The main floor under a hexagonal honeycomb of cool-white LED tubes. Exposed black ceiling and steel beams, black speckled rubber floor, black racks, and red, blue and green plyo boxes. | Hero fallback: cover, blur(24px), opacity 0.35. Spaces section at its natural size. Never show it sharp above 141×235. |

**App icons.** APP-01 may also use `mobile/assets/icon.png`, `android-icon-foreground.png` (the adaptive icon, on #FFFFFF), `splash-icon.png` and `favicon.png`.

**Code.** If you can read it, the repo is GitHub `sami561/gym`, branch `main`.
- Tokens: `web/src/index.css`, `mobile/src/theme/index.ts`.
- Copy:
  - app: `mobile/src/i18n/*.ts`
  - website: `web/src/i18n/landing.ts`
  - back-office: `web/src/admin/pages/**` and `web/src/i18n/messages/*.ts` (French keys with English and Arabic, about 1,200 entries)
  - push notifications: `backend/apps/notification-service/src/push/push-messages.ts`
  - door denial reasons: `backend/apps/access-service/src/access/access-decision.ts`
  - e-mails: `n8n/templates/`, with filled previews in `n8n/preview/`
- Where the code and this brief disagree, this brief wins, because it settles the inconsistencies.

---

## 2. Design system (pass 1)

### 2.1 Brand direction
The direction comes from the real building, not from a generic fitness look.
- **Black shield, one red.** Black dominates and white is the figure. Red appears only where the hammer and chisel are: action, focus, the active or selected state, progress, short rules and stripes.
  - Red never decorates. Icons that only label something (pins, ribbons, bullets, avatars) use `text-2` or `led`.
  - Never use large red areas. There are four deliberate exceptions:
    - the website Instagram band, which is fully red
    - the app door card, a red to dark-red gradient
    - the 168 px «Ouvrir» door button
    - the kiosk's full-bleed denied verdict (#B3261E)
- **Steel cladding.** The facade's cool blue-grey corrugated steel gives the steel colour ramp and the vertical-rib texture.
- **Hexagon LED ceiling.** Cool white light (#E9F2FF) in a honeycomb. It gives the hex line pattern, the LED glow and the 3D website hero.
- **Extended lettering.** The wordmark and the facade letters are wide, squared capitals with rounded corners, so display type is extended.
- **Industrial premium.** Black rubber floor, black racks, brushed steel and glass. Keep it restrained: big type, one strong accent and lots of black.
- **Forged and sculpted.** «Forge ta meilleure version» / "Forge your best self" / «اصنع أفضل نسخة منك» · «chacun sculpte sa meilleure version, séance après séance».
- **Local.** Sousse, a trilingual FR/AR/EN audience, dinars with millimes, and D17 payments.

### 2.2 Decisions that settle today's inconsistencies
Design with these decisions. If one of them clearly hurts a screen, say so in a note rather than quietly diverging.
1. **One type family.** Use Archivo on all three surfaces (§2.4). Its extended width matches the facade lettering. The app's Bebas Neue (condensed, the opposite proportion) and Inter are retired. Cairo is the Arabic font everywhere.
2. **Graphite for the app and back-office, steel for the website. Never mix the two on one surface.** The back-office light theme moves from warm neutrals to cool ones.
3. **One status palette per theme**, shared by every surface. Today the greens, ambers and reds differ between web and app.
4. **Currency label.** Use «DT» in French and English and «د.ت» in Arabic. The app's English «TND» goes.
5. **Booking statuses look the same everywhere:**
   - Réservé is info (blue). The app shows it in green today.
   - Présent is success.
   - En attente is warning.
   - Absent and Annulé tardivement are danger.
6. **Current vs past status.** A problem *now* is danger. That covers an Expiré or Suspendu membership on the app card, on the Pass or on a member's badge. The same word on a past row of a history table is neutral.
7. **Change: member badges show the subscription state.** «Actif» (success), «Gelé» (info), «Expiré» (danger), «Suspendu» (danger), «Sans abonnement» (neutral, never subscribed). Today the back-office only knows Actif, Sans abonnement and Suspendu. Expired and frozen members therefore read «Sans abonnement», even under the «Expirés» tab.
8. **Access-method names: both sets are intended.**
   - Members see «Pass QR», «Application», «Badge», «Empreinte», «Accueil».
   - Staff see «QR code», «Application», «Badge», «Empreinte», «Manuel».
9. **One value per token.**
   - `red-700` is #8F0C11 everywhere (the app has #8F0C10 today).
   - One `overlay` sits behind every modal, sheet and drawer (§2.3).

### 2.3 Colour tokens
The "Code" column names today's token as web CSS variable · app `colors` key. "new" means no token exists yet.

**Brand and fixed colours**
| Token | Hex | Code | Use |
|---|---|---|---|
| `black` | #000000 | `--color-shield` · `colors.black` | Website "shield" sections, browser theme-color |
| `red-700` | #8F0C11 | `--color-brand-700` · `colors.redDark` | End of the door-card gradient, inactive Pass tab, danger-button border on dark |
| `red-600` | #B51016 | `--color-brand-600` · new | Red hover and pressed. On light: danger buttons and brand badges |
| `red-500` | #D7141A | `--color-brand-500` · `colors.red` | **The brand red**, a cleaner version of the lit sign's #CB1C2F. Primary buttons, active indicators, red rule, countdown ring, selected spot, featured-plan bar, Instagram band |
| `red-400` | #EF3B40 | `--color-brand-400` · new | Focus ring on dark. Red text on `bg` and `surface`. Red marks on `surface-3` and steel-800 |
| `red-300` | #F6777A | `--color-brand-300` · new | Small red text on any dark surface: links, field errors, danger labels, brand badges |
| `red-soft` | rgba(215,20,26,0.14); 0.12 on light | new · `colors.redSoft` | Error box, danger pill, "your spot" fill |
| `white` | #FFFFFF | — · `colors.white` | Text on red, logo tile, QR tile |
| `chalk` | #F4F5F6 | `--color-chalk` · new | Main text on dark; light-theme page |
| `led` | #E9F2FF | `--color-led` · new | LED glow, website icons, hex lights |

**Steel ramp** (`--color-steel-*`). A cool blue-grey taken from the cladding. Steel-500 is close to the fascia, and steel-400 to the street-level panels.
950 #141517 · 900 #1D1F22 · 800 #272A2E · 700 #363A3F · 600 #4A4E54 · 500 #62666D · 400 #8B9097 · 300 #B3B7BD · 200 #D6D9DC · 100 #ECEEF0

**Graphite: dark theme (app and back-office)**
| Token | Hex | Code | Use |
|---|---|---|---|
| `bg` | #0B0B0C | `--page` · `colors.bg` | Page and screen background |
| `surface` | #141416 | `--card` · `colors.surface` | Cards, tab bar, sidebar |
| `surface-2` | #1C1D20 | `--card-2` · `colors.surfaceAlt` | Fields, segmented tracks, table headers, nested blocks |
| `surface-3` | #26272B | new · `colors.surfaceHigh` | Hover, toasts, popovers, selected rows, progress and ring tracks, neutral icon circles |
| `line` | #2C2D32 | `--line` · `colors.border` | Hairlines and card edges. Decorative only |
| `field-border` | #72767D | new | Edges of fields, checkboxes, toggle tracks and unselected radio cards (3.16–4.6:1 on every dark surface) |
| `text` | #F4F5F6 | `--fg` · `colors.text` | Primary text |
| `text-2` | #B3B7BD | `--fg-2` · `colors.textMuted` | Secondary text |
| `text-3` | #8B9097 | `--muted` · `colors.textFaint` | Meta, captions, inactive tabs, placeholders. The faintest text allowed |
| `disabled` | #62666D | new | Disabled labels and decoration only |
| `overlay` | rgba(0,0,0,0.60) with a 2 px backdrop blur | `bg-black/60` in `Modal` and `AdminLayout` · `colors.overlay` | Behind modals, sheets and drawers |

**Light theme (back-office only).** These are the same variables under `[data-theme="light"]`.
- Surfaces: `bg` #F4F5F6 · `surface` #FFFFFF · `surface-2` #ECEEF0 · `surface-3` #E4E6E9 · `line` #D6D9DC.
- `field-border` #62666D (at least 4.96:1).
- Text: `text` #0B0B0C · `text-2` #4A4E54 · `text-3` #62666D (at least 4.61:1 on every light surface) · `disabled` #8B9097.
- `overlay` rgba(11,11,12,0.40). **Change:** the code uses 60% black in both themes.

**Website (always dark)**
- Sections alternate between `black` and steel-950.
- Cards are steel-900. Textured bands are steel-800 with ribs (§2.8).
- Hairlines are white at 10%.
- Text is white, steel-300 or steel-400 (never steel-400 on steel-800). Icons use `led`.
- Form fields have a black fill and a white ring at 40% (3.66:1).

**Status.** A fill is its tone at 14% on dark and at 12% on light.
| Tone | Dark: text and icon | Dark: fill | Light: text | Light: icon and fill |
|---|---|---|---|---|
| success | #22C55E | `success-soft` | #006300 | #006300 |
| warning | #F59E0B | `warning-soft` | #8A5A00 | #B57A00 (icons and fills only, 3.65:1) |
| info | #60A5FA | `info-soft` | #1E5BAF | #1E5BAF |
| danger | `red-300`; `red-500` for icons of 24 px or more (`red-400` on `surface-3`) | `red-soft` | #B3261E | #B3261E |
| neutral | `text-2` | `surface-3` | `text-2` | `surface-2` |
| brand | `red-300` | `red-soft` | `red-600` | `red-soft` |

These replace today's web `--good-text`, `--warn` and `--bad-text` and the app's `colors.green`/`greenSoft`, `colors.amber`/`amberSoft` and `colors.blue`/`blueSoft`.

Kiosk verdict screens are full-bleed with white text: granted #0A7A0A (5.52:1), denied #B3261E (6.54:1).

**Data colours**
- **Chart series** (`--series-1…3`). Charts always sit on `surface` cards.
  - Dark: #3987E5, #D95926, #199E70.
  - Light: #2A78D6, #EB6834, #199E70 (3.2–4.4:1 on white).
  - **Change:** the code's light green #1BAF7A is only 2.82:1.
- **Class colours.** Staff pick one per class; it shows as card stripes and capacity bars.
  - Rouge Meliora #D7141A, Bleu #3987E5, Vert #199E70, Ambre #C98500, Violet #9085E9, Acier #8B9097.
  - On light, Ambre, Violet and Acier reach 3:1 only on white, so keep their stripes and bars inside white cards.
- **Position colours** (`--pos-1…6`). Used in team views, always shown with the label.
  - Dark: Gérant #3987E5, Accueil #D95926, Coach #199E70, Entretien #C98500, Maintenance #D55181, Autre #008300 (3.7–6.0:1 on `surface`).
  - Light: Gérant #2A78D6, Accueil #D95926, Coach #199E70, Entretien #B57A00, Maintenance #D55181, Autre #008300 (at least 3.1:1 on #F4F5F6 and on white).
  - **Change:** the code's light set (#EB6834, #1BAF7A, #EDA100, #E87BA4) falls to 2.0–2.9:1 on the light page.
- **Age groups** (`--ord-1…5`, ordinal).
  - Dark: #CFE2FA #9EC4F3 #6DA7EC #4F94E8 #3987E5 (at least 4.6:1 on `surface` and `surface-2`).
  - Light: #2A78D6 #2265B8 #1C5CAB #164C91 #104281 (at least 4.4:1 on white).
  - «Non renseigné» uses steel-400.

**Contrast rules (computed; keep to them)**
- **`red-500` on dark is 2.75–4.0:1.**
  - It reaches 3:1 on `black`, `bg`, `surface`, `surface-2`, steel-950 and steel-900.
  - It fails on `surface-3` (2.85) and steel-800 (2.75). There, icons, rings and active marks use `red-400` (3.7–3.8:1).
  - Use it for fills, bars, rings, and for icons and display text of 24 px or more. Never for smaller text.
  - White on `red-500` is 5.24:1.
- **Small red text.**
  - On any dark surface, use `red-300` (at least 5.38:1).
  - `red-400` text is allowed only on #000, #0B0B0C, #141416 and #141517 (at least 4.67:1).
  - On light, use `red-500` (at least 4.51:1) or `red-600`. `red-300` is dark-only: it is 2.68:1 on white.
- **Faintest text.** `text-3` is at least 4.64:1 on every graphite surface. On corrugated steel-800 bands, use steel-300 instead, because steel-400 is only 4.48:1 there.
- **Hairlines vs control edges.** `line` is about 1.4:1, so it is decorative only. Anything that identifies a control (field border, checkbox, toggle track, unselected radio card) uses `field-border` (at least 3:1).
- **Coloured chips** (shift chips, class chips): the label is in `text` on a 20% tint, with a solid 3 px start stripe. Never put white text on Ambre or on the Accueil orange.
- **Text on red** is solid white, never white at reduced opacity. White at 80% is only 3.72:1 on `red-500`.

### 2.4 Typography
**Fonts**
- **Archivo.** Use only three widths: 100, 112.5 (SemiExpanded) and 125 (Expanded).
  - Web: load `Archivo:wdth,wght@62..125,100..900` from Google Fonts and set the width with `font-stretch`.
  - App: React Native can't drive the width axis reliably, so the app ships static instances:
    - Archivo 400, 500, 600 and 700
    - Archivo SemiExpanded 700
    - Archivo Expanded 600 and 800
- **Cairo** for Arabic. On the web load `Cairo:wght@400..800`; the app bundles Cairo 400, 500, 600, 700 and 800.
- **Monospace:** `ui-monospace, "SF Mono", Menlo, monospace`. Use it only for one-time keys and passwords and for the cron field.
- Every number uses tabular figures: tables, tiles, prices, times and timers.

**Web (website and back-office)**
| Style | Width / weight | Size / line-height | Tracking | Use |
|---|---|---|---|---|
| display-hero | 125 / 800 | clamp(50px, 8.8vw, 118px) / 0.92 | −0.015em | Website hero H1: two lines from 768 up, three lines on phones |
| display | 125 / 800 | 48–60 (36–40 on phones) / 0.95 | −0.01em | Website H2, 404, prices |
| title | 112.5 / 700 | 24–28 / 1.15 | 0 | Back-office page H1, brand name, plan, room and coach names |
| kpi | 112.5 / 700 | 28 / 1.1, tabular | 0 | Stat-tile values |
| heading | 100 / 600 | 16–18 / 1.3 | 0 | Card and modal titles |
| lead | 100 / 400 | 18–20 / 1.5 | 0 | Website intro paragraphs |
| body | 100 / 400 | 16 site · 14 back-office / 1.5 | 0 | Running text |
| button | 100 / 600 | 14 / 18 (13 on 32 px buttons) | 0 | Button labels, sentence case |
| label | 100 / 500 | 13 / 1.35 | 0 | Form labels, tabs |
| caption | 100 / 400 | 12 / 1.4 | 0 | Hints, meta, table headers |
| overline | 125 / 600 | 11–12 / 1.3, uppercase | 0 | Group headers only: back-office sidebar groups and section headers. No kickers above website headings |

**App.** Archivo replaces Bebas Neue and Inter. Extended type is wide, so titles wrap to two lines rather than truncate. Check every title at 360 px.
| Style | Width / weight | Size / line-height | Use |
|---|---|---|---|
| hero-num | 125 / 800 | 56 / 56, tabular | Days left on the membership card |
| display | 125 / 800 | 28 / 32 | Screen titles and the greeting («Cours collectifs», «Mon pass», «Salut, Amira») |
| title | 112.5 / 700 | 22 / 26 | Names, plan name, «Ouvrir la porte», «4 places restantes», the door button's «Ouvrir» (set in uppercase) |
| time | 112.5 / 700 | 22 / 24, tabular | Class times, «Nouveau code dans 12 s» |
| button-lg | 100 / 700 | 15 / 20, uppercase, +0.04em | Large buttons in French and English. At width 100, «Rejoindre la liste d’attente» measures about 265 px, so it fits a full-width button at 360 |
| button | 100 / 600 | 14 / 18, sentence case | Small and medium buttons |
| heading | 100 / 600 | 17 / 22 | Card titles |
| body / body-strong | 100 / 400 · 600 | 15 / 21 | Running text |
| label | 100 / 500 | 13 / 18 | Field labels, meta |
| caption | 100 / 400 | 12 / 16 | Captions |
| overline | 125 / 600 | 11 / 14, uppercase | Group headers only («Abonnement», «Prochain cours») |
| tab | 100 / 500 | 11 / 14 | Tab labels |

**Arabic (Cairo, every surface)**
- No width axis, no letter-spacing and no uppercase.
- Display styles use Cairo 700–800 at about 78% of the Latin size, with a line-height of 1.15 on web and 1.5 in the app.
- Body text is the same size as Latin, with a line-height of at least 1.6.
- Latin words and digits inside Arabic frames (class names, «MEL-00042», «18:00», amounts) are set in Cairo, using the font stack Cairo, Archivo as the code does. They run left to right, with Latin digits and tabular figures.

### 2.5 Layout, spacing, shape and elevation
**Spacing:** 4 · 8 · 12 · 16 · 24 · 32, plus 48 · 64 · 96 · 128 for website sections.

**Layout per surface**
- **Website:**
  - content max-width 1280
  - side gutters from 20 on phones up to 32 on desktop
  - section padding 96–128 vertical (64 on phones)
- **Back-office:**
  - Sidebar 256 px. Below 1024 px it becomes a 288 px drawer.
  - Top bar 56 px.
  - Content max-width 1400 with 24–32 px padding, on a 12-column grid with 16–24 px gutters.
  - Below 640 px: modals become bottom sheets, toasts go full width and secondary table columns hide.
- **App:**
  - 16 px side gutters; safe areas respected.
  - Tab bar 88 px on iOS and 68 px on Android.
  - Sticky bottom action bars have a hairline top border.

**Radii**
- **Web:** 6 small controls · 8 buttons and fields · 12 cards (with a 1 px ring) · 16 media and modals · pill for badges and segmented controls.
- **App:** 8 spot squares · 12 fields and tiles · 18 cards, the QR tile and the door card · 24 membership card and sheets · pill.

**Control heights**
- **Web:** buttons 32 / 40 / 48. Fields 40, or 48 on the website and kiosk pages.
- **App:** buttons 38 / 50 / 60. Fields 50.

**Elevation**
- On dark, depth comes from the surface steps plus hairlines, not from shadows. Shadows are only for floating layers:
  - `float`: 0 8px 24px rgba(0,0,0,.45), for toasts, popovers and the QR tile
  - `modal`: 0 24px 64px rgba(0,0,0,.6), over `overlay`
- Light theme:
  - `card`: 0 1px 2px rgba(11,11,12,.06)
  - `float`: 0 8px 24px rgba(11,11,12,.12)
- `led-glow`: 0 0 60px rgba(233,242,255,.18). Brand moments only, such as the hero logo tile.

### 2.6 Motion
**Standard transitions**
- Easing is `cubic-bezier(0.22,1,0.36,1)` everywhere.
- Durations:
  - press: 120 ms
  - state changes and the segmented indicator: 200 ms
  - sheets, drawers and push transitions: 320 ms
  - website hero entrance: 600–900 ms
- Pressed elements scale to 0.97 in the app and 0.98 on web.
- List stagger (app and back-office only): 40 ms on the first 8 items, played once.

**Motion that carries meaning.** Beyond the standard transitions, only the following move. Spec each one precisely.
- the QR countdown ring and the cross-fade between codes
- the door "locating" pulse halo and the "granted" spring
- the spot-selection spring to 108%
- the live-feed row flash, the «En direct» pulse dot and the toast spring-in
- the segmented indicator slide, and the app's tab-switch shift transition (a short fade and slide)
- the APP-19 progress bar as it fills
- the animated edges that leave in-progress workflow tasks
- the website hero: LED flicker wave, title slide-up and red-rule scale-in
  - This is the only entrance animation on the website; sections don't animate in on scroll.
- spinners and skeleton pulses

**No decorative loops.** The only loops are spinners, skeleton pulses, the door halo, the «En direct» dot, the in-progress workflow edges and the countdown ring.

**Reduced motion**
- No pulse, no 3D, no parallax and no stagger. State changes become cross-fades of 150 ms or less.
- The countdown ring keeps updating because it carries information, but it steps once per second.

**RTL**
- Pushed screens come in from the left.
- The nav drawer comes from the right, detail drawers from the left.
- The segmented indicator mirrors.

### 2.7 Icons and imagery
- **Icon sets:** lucide on web, Ionicons in the app.
  - Icons are outlined by default and filled for the active tab, at 16, 20 or 24 px.
  - No other icon sets and no emoji.
- **Photos:** use only the four real photos, plus real uploads where the product has them (see below).
  - Darken photos with gradients towards #0B0B0C or #000, as each screen specifies.
  - No duotone, no colour grading, no red overlays.
- **Placeholders**, where no image exists:
  - product tiles: a bag icon on `surface-3`
  - app profile: initials on a `surface-3` circle
  - website coaches: `led` initials on steel-800
  - back-office staff: a position-colour square
- **Photo slots for real uploads.** Draw both the photo state and the placeholder state. Use a flat steel-700 block as the photo stand-in, never a stock image.
  - coach `avatarUrl`: 80 px round, object-cover, white/15 ring (website, back-office)
  - product `imageUrl`: 4:3, cover

### 2.8 Brand devices (use these; don't invent new ones)
- **Logo tile:**
  - A white rounded tile with the JPEG unaltered at 92% of the tile. Radius max(8 px, 22% of the tile size).
  - Sizes:
    - 40–44 in the site header
    - 48 on the back-office login
    - 52 on app Home
    - 56 in the footer and the e-mail header
    - 64–80 in the website hero, with `led-glow`
    - 80 on app sign-in (**Change:** 88 in code)
  - Never larger than about 80 px, because the source is only 150 px. Larger brand moments use `shield-sign.jpg`.
  - Exceptions: the APP-01 splash and app icon (mark them «needs vector original»), and the printed receipt, where the printer renders the logo in greyscale.
- **Corrugated steel:** steel-800 with vertical ribs every 16 px. Each rib is a 1 px rgba(255,255,255,.07) light edge followed by a 2 px rgba(0,0,0,.22) shadow. Only on the website facts strip and trial section.
- **Hex pattern:**
  - A 56 × 98 px tile of white hexagon outlines, with 1.5 px strokes at 6% and at 4% opacity.
  - The layer runs at 70% over the hero fallback, fading out towards the bottom, and at 40% on the Instagram band.
  - Nowhere else.
- **Red rule:** a 6 × 112–160 px bar in `red-500` under the hero title. It echoes the rules around "GYM".
- **Start-edge stripe:** a 3–4 px bar on the start edge.
  - Red on the membership card and on the active nav item.
  - The class colour on class cards and planning sessions.
- **Raised Pass button:** the 48 px red circle in the centre of the app tab bar.

### 2.9 Components
Build each component with every variant and state: default, hover, pressed, focus-visible, disabled, loading, and error where relevant. Draw each in dark. Draw back-office components in light as well, and add an RTL specimen.

**Actions and inputs**
- **Buttons:**
  - primary (red)
  - secondary (`surface-2` with `field-border`)
  - ghost
  - danger: on dark, transparent with a `red-300` label and a `red-700` border; on light, a `red-600` label and border
  - success (green, back-office only)
  - light (white, for use on photos and on the red band)
  - icon-only, with a tooltip
  - Loading keeps the button's width.
- **Fields:** text, e-mail, password (with an eye toggle), phone (+216), number with a unit (kg, cm, %, DT), search (debounced, with a clear button), select, date, date-time and textarea.
  - The label sits above the field; a hint or error sits below it. An error shows a red border, `red-300` text and an icon.
  - **Promo-code field:** idle → «Vérification…» → applied or error.
  - **Member picker:** search, result rows, and a selected chip with ×.
- **Selection controls:**
  - checkbox, radio, radio card (door choice) and switch
  - segmented control, with a sliding indicator and optional counts
  - tabs
  - chips: filter, day chip with a dot, metric chip, type chips
  - quantity stepper

**Display**
- **Badges and pills:** a dot or icon plus text on a tint, in the success, warning, info, danger, neutral and brand tones. Also countdown badges («J-5») and counters.
- **Cards:**
  - Base card.
  - StatTile: label, value, a change with a trend icon and «vs mois dernier», a status and a note.
  - KPI strip: several stats in one card divided by hairlines. Build every KPI and count row this way, not as separate cards.
  - Compact tile.
  - Link tile with two metrics and an alert state.
  - List row: icon tile, title, caption and trailing value.
  - Empty card.
- **DataTable:**
  - Headers are 12 px in `text-3`; figures are tabular.
  - Rows can be clickable and can have row actions. Some columns hide at narrow widths.
  - Loading shows skeleton rows. While refetching, the table dims to 60%.
  - Empty and error rows; pagination «1–20 sur 538».
- **Charts:**
  - Vertical, horizontal, grouped and paired bars; single and multi-line; percentage line; 100% stacked bar; hourly histogram.
  - The chart card holds a title, a subtitle, a legend, the «Tableau» / «Graphique» toggle and a table twin.
  - The app line chart has a crosshair and a tooltip.

**Complex views**
- **Time views:** a week grid with day columns (planning and team calendar), and a day Gantt with hour ticks, a current-time line and a time chip.
- **Kanban:** columns with counts, cards, and «Rien ici» in an empty column. No drag handles.
- **Node graph:** a 230×96 task node (manual or automatic), handles, edges, the selected state, status rings, a minimap, zoom controls and an inspector panel.

**Overlays and feedback**
- **Overlays:**
  - Modals at 448, 512, 672 and 896 px. Below 640 px they become bottom sheets.
  - Drawers: the nav drawer comes from the start edge, and detail drawers (lead, bookings) from the end edge. Both mirror in RTL.
  - A confirm dialog, neutral or destructive.
  - In the app: the door sheet (grabber and a round close button) and modal screens (a header with a title and a round X, no grabber).
  - Native alerts for iOS and Android.
- **Toasts:**
  - Web: in the bottom end corner, up to 4 stacked, full width on phones. A success toast stays 3.5 s, an error toast 6 s.
  - App: one pill under the status bar for 2.6 s.
- **Banners and notes:** warning, blocked, offline and inactive banners, plus an inline error note with «Réessayer».
- **Feedback patterns:**
  - **Loading:** skeletons shaped like the content on web; a red spinner with «Chargement…» in the app.
  - **Empty:** an icon (in a 56 px circle in the app), a title, one line of help and an optional action.
  - **Error:** the same layout with a `red-soft` icon and «Réessayer».
  - **Refetch:** keep the content visible and dim it.

**Navigation and domain pieces**
- **Navigation:**
  - Back-office: sidebar, top bar and drawer.
  - App: tab bar; top bar with a round 36 px back button; pushed and modal headers.
  - Website: header and mobile menu.
  - Language switcher, in three versions:
    - «FR» «EN» «ع» pills for the back-office
    - the same pills in the dark website version
    - the app's segmented «Français» «English» «العربية»
  - The back-office theme toggle.
- **Domain pieces:** MembershipCard, ClassCard, SpotPicker, the CountdownRing with its QR tile, the door button, capacity bar, progress bar, checklist row (with a 28 px round checkbox) and the 80 mm receipt.

### 2.10 Status language
One mapping for every surface. A status is always shown as a dot or icon plus text.
- **success:**
  - Actif, Présent, Autorisé, Payée/Payé, Accepté, Résolu, En vente
  - Terminée (tasks), Terminé (workflow runs), Faite/Effectuée (coaching), En cours (training programs)
  - En service, Ouverte (rooms), En ligne, Connecté
  - «Pointé à 13:56», Corpulence normale
- **info:** Réservé, Gelé, Prévue/Planifiée, À faire, À venir, Hors planning, En cours (tickets and workflow runs), Moyenne (priority), the Coach role.
- **warning:**
  - En attente / «En attente #2», Liste d’attente, Complet (on every surface)
  - En cours (tasks), Ouvert (tickets), En maintenance, Brouillon, Épuisé, Échu
  - «J-5», «Attendu à 19:00», a late clock-in in Pointage («12 min»), Haute, «Essai le 21 nov.»
  - low stock, Surpoids, Insuffisance pondérale
- **danger:**
  - Expiré and Suspendu (as a current status), Absent, Annulé tardivement, Refusé, Remboursée
  - En panne, Urgente, En échec, En retard, Relance due, Hors ligne, Déconnecté
  - «J-2», «J-1», «Aujourd’hui», Perte, Obésité
  - Annulé (a subscription cancelled by staff)
- **neutral:**
  - Sans abonnement / Aucun abonnement
  - Expiré (past rows and promo codes), Terminé (past classes), Annulée (coaching), Annulé (workflow runs)
  - Retiré(e), Archivé, Inactif, Désactivé(e), Parti, Fermée, Bloquée, Ignorée, Basse, Hors service
  - the Accueil role
- **brand:** the Administrateur role, «Le plus choisi».

### 2.11 Data visualisation
- Every chart uses the same card: title, subtitle, legend, the «Tableau» / «Graphique» toggle and a table twin. The card is always a `surface` card.
- No pies or donuts; use bars.
- Label lines and bars directly when there are four series or fewer.
- Tooltips show exact formatted values («21 480,000 DT», «186 entrées»).
- Axis ticks are compact («1,2 k»). Hour labels read «18h» in French and English and «18:00» in Arabic.
- Time axes run left to right in every language. That covers charts, the Gantt and the app progress chart. Horizontal bars that are not time axes grow from the start edge, so they mirror in Arabic.
- Gridlines are hairlines. Bars get a 2–4 px radius at the value end.
- Colour never carries meaning alone: add a legend and labels. Profit and loss bars also differ by label and sign.
- States: skeleton, empty («Aucune pesée enregistrée»), error with «Réessayer», and dimmed while refetching.

### 2.12 Accessibility (WCAG 2.2 AA)
- **Contrast:**
  - Text needs at least 4.5:1, or 3:1 at 24 px and above (18.66 px bold).
  - Icons and control edges need at least 3:1.
  - Use the pairs checked in §2.3.
- **Focus:** every interactive element shows a 2 px outline with a 2 px offset: `red-400` on dark, `red-500` on light. Never remove it.
- **Touch targets:**
  - At least 44×44 in the app and on kiosk pages. Extend the hit area of 38 px buttons, day chips and icon buttons.
  - Web pointer targets are at least 24×24, with spacing between them.
- **No colour-only meaning:**
  - Taken spots use a dashed border plus a person icon.
  - Statuses use a dot plus text.
  - Capacity uses a bar plus text.
- **Screen readers:**
  - Icon-only buttons get names: «Fermer», «Fermer le menu», «Afficher le mot de passe».
  - The membership card reads as one label: «Trimestriel, Actif».
  - The spot picker is a radiogroup: «Place n°9, Libre».
  - Success toasts and the live feed are polite live regions. Error toasts and blocking banners use the alert role.
- **Alt text:**
  - Photos and the QR illustration use the existing alt text in all three languages (`about.imageAlt`, `spaces.imageAlt`, `location.facadeAlt`, `app.qrAlt` in `web/src/i18n/landing.ts`).
  - A logo tile next to the gym name has empty alt text.
- **Text size:** app layouts survive 130% system text size. No text is baked into images.
- **Reduced motion:** see §2.6.

### 2.13 Languages, RTL and formats
**Languages**
- French is the reference and the default, then English and Arabic.
- Size every component for the longest of the three strings.
- Back-office: start from `web/src/i18n/messages/admin.ts`, which has about 1,200 entries in English and Arabic, and translate only the strings that are missing.
- In the app's Arabic, reuse its existing terms:
  - Membership and pass: الاشتراك (abonnement), بطاقة الدخول (pass), منخرط (membre).
  - Classes: الحصص الجماعية (cours collectifs), محجوز (réservé), قائمة الانتظار (liste d’attente).
  - Other screens: فتح الباب (ouvrir la porte), التمارين (entraînement), السجلّ (historique), حسابي (profil), الاستقبال (accueil).

**RTL (Arabic)**
- Set `dir=rtl`. Use start and end, never left and right.
- Mirror:
  - layout and text alignment
  - the sidebar (on the right), the nav drawer (from the right) and detail drawers (from the left)
  - back chevrons and arrows
  - the tab order and start-edge stripes
  - the segmented indicator
  - day-column grids, with the first day on the right: the app day strip, the website schedule, and the planning and team-calendar week grids
  - horizontal bars that are not time axes, and capacity and progress fills, which fill from the start edge
- Do **not** mirror logos, photos, QR codes, phone numbers, codes or digits.
- These stay left to right: chart time axes, the Gantt hour axis, the app progress chart and the workflow canvas.

**Numbers, time and money**
- Digits are Latin 0–9 in every language.
- Times use the 24-hour clock («18:00»). The timezone is Africa/Tunis (UTC+1, no daylight saving).
- Money is TND with 3 decimals (millimes):
  - FR «1 234,500 DT», with a narrow no-break space
  - EN «1,234.500 DT»
  - AR «1.234,500 د.ت», with the currency after the number in reading order
- Tiles round to whole dinars («21 480 DT»). An unknown price on public pages shows as «Tarif en salle».

**Dates and identifiers**
- Dates:
  - FR: «jeudi 19 novembre 2026», «19 nov.», «19 nov., 18:04»
  - EN: «Thursday, 19 November 2026», «19 Nov»
  - AR: «الخميس، 19 نوفمبر 2026», with the Tunisian month names: جانفي، فيفري، مارس، أفريل، ماي، جوان، جويلية، أوت، سبتمبر، أكتوبر، نوفمبر، ديسمبر
- In ar-TN the short weekday is the full name, so size day chips for «الأربعاء».
- Relative times: «il y a 5 minutes» / «5 minutes ago» / «قبل 5 دقائق».
- Identifiers:
  - member code «MEL-00042»
  - QR payload «MLR1.MEL-00042.{step}.{sig}»
  - phone «+216 98 123 456»
  - sale number «V-2026-000412»

**What stays French in every language:**
- server error messages and door-denial reasons
- push notifications and e-mails
- data entered by staff (class titles, rooms, doors, programs, exercises)
- the opening-hours strings («Lun – Sam»)

Show this honestly in the EN and AR frames.

### 2.14 Voice
- **Website:** «tu», direct and energetic.
- **App:** «vous» for instructions, plus the first name for warmth («Salut, Amira»).
- **Back-office:** «vous», neutral and task-first, in sentence case.
- **E-mails:** «vous», warm, using the first name.
- Copy in «…» is final. Don't add slogans, and don't shorten error messages.

---

## 3. Mock data pack and business rules (keep them consistent across every frame)

**Time and place**
- **Now:** jeudi 19 novembre 2026, 18:45 (Africa/Tunis). The current week is 16–22 Nov.
- **Gym:** Meliora Gym, Khzema Est, Rue Colonel Garnaoui, Sousse 4051, Tunisie.
  - Hours: «Lun – Sam 06:00 – 22:00», «Dimanche 08:00 – 14:00».
  - Instagram @gymmeliora · contact@meliora-gym.tn.
- **Still unconfirmed:** the opening hours and the phone number. Lay the phone out with «+216 73 000 000», and add a variant without it: the website phone line hidden, and the app's «Appeler» button removed.

**Business rules** (backend defaults; the samples follow them)
- Bookings open 7 days before a class and close when it starts.
- Cancellation is free until 2 h before the start. Later cancellations become «Annulé tardivement».
- A no-show («Absent») or a late cancellation counts as a strike. 3 strikes in 30 days block new bookings for 7 days.
- A door check-in from 30 min before the start until the end marks the booking «Présent».
- The reminder push goes out 2 h before the class.
- Opening the door remotely needs the phone within 150 m of the gym, with up to 50 m of GPS inaccuracy allowed.
- The QR code changes every 30 s.

**Offers and prices**
- **Plans:** these are sample prices; the real ones come from the back-office.
  - Mensuel, 30 jours, 90,000 DT
  - Trimestriel, 90 jours, 240,000 DT, featured («Le plus choisi»)
  - Annuel, 365 jours, 800,000 DT
- **Payment methods:** Espèces, Carte bancaire, Virement, D17.
- **Promo codes:**
  - INSTA15: 15,000 DT, 1 nov. → 30 nov., 12 / 50, Actif
  - RENTREE26: 10 %, 1 sept. → 30 sept., 37 / 50, Expiré
  - NOEL26: 20 %, 20 déc. → 31 déc., À venir

**People**
- **Main member (the app user): Amira Jaziri**
  - MEL-00042. Member since 12 mars 2025, born 21 avril 1998, +216 98 123 456, amira.jaziri@example.com.
  - Trimestriel from 14 sept. to 12 déc. 2026, so «23 jours restants». The next Trimestriel is already paid, from 13 déc.
  - 11 visits this month, 214 in total, last visit 17 nov. Locker F-12.
  - Bookings: today's 19:00 Cycling, place n°7; Saturday's Cycling, «En attente #2».
  - Past bookings: 17 nov. Body Pump «Présent», 12 nov. Cycling «Absent», 10 nov. HIIT Express «Annulé tardivement». The last two are her 2 strikes in the last 30 days.
  - Weight went from 81,0 to 78,5 kg over 3 months; BMI 24,1.
- **Other members:**
  - Yassine Ben Salah: MEL-00118, Mensuel, ends 21 nov. (J-2), +216 22 456 789
  - Ines Karoui: Trimestriel, ends 24 nov. (J-5)
  - Fares Dridi: Mensuel, ends today
  - Mariem Chaabane: Annuel, frozen 14 days, «Voyage»
  - Oussama Hammami: Suspendu
  - Nour Mejri: Mensuel, expired 31 oct.
  - Skander Gharbi: new today, MEL-00539
  - Hamza Mabrouk, Nada Jebali
  - Salma Ayari: prospect from Instagram
- **Team:**
  - Mehdi Saidi: Gérant, Administrateur
  - Hela Gharsallah and Rim Zouari: Accueil
  - Coaches: Ahmed Kchaou (Cross training, HIIT), Leila Mzoughi (Cycling, mobilité), Sami Haddad (Musculation, Body Pump)
  - Fatma Riahi: Entretien
  - Moez Jlassi: Maintenance

**Rooms, doors and lockers**
- **Rooms:**
  - Plateau musculation (ground floor, 60 people)
  - Espace cardio (ground floor, 25)
  - Zone cross training (ground floor, 20)
  - Studio (1st floor, 20)
  - Studio vélo (1st floor, 16 numbered bikes)
  - Not shown on the site: Accueil, Vestiaire femmes, Vestiaire hommes
- **Lockers:** F-1…F-40 in Vestiaire femmes and H-1…H-40 in Vestiaire hommes, 80 in all.
- **Doors:**
  - Entrée principale: Rez-de-chaussée, Terminal ZKTeco via PC-Accueil, En ligne
  - Studio: 1er étage, Relais HTTP, En ligne
  - Porte de service: Simulateur, Désactivée

**Classes.** The app's 7-day strip runs from Thu 19 to Wed 25 Nov.
- **Today (Thursday 19):**
  - 07:00–07:30 HIIT Express, Ahmed, Zone cross training, 12 places, Ambre (over)
  - 12:30–13:30 Body Pump, Sami, Studio, 20 places, Violet (over)
  - 18:00–19:00 Cross-training, Ahmed, Zone cross training, 20/20, Rouge Meliora (in progress)
  - 19:00–19:45 Cycling, Leila, Studio vélo, 12/16, numbered spots, Bleu. Amira has place n°7. Free cancellation ended at 17:00, and 5 people are already checked in.
  - 20:15–20:45 HIIT Express, Ahmed, 8/12, Ambre
- **Friday 20:**
  - 07:00 HIIT Express, 5 places left
  - 12:30 Body Pump
  - 18:00 Cross-training, «Complet · 3 en attente»
  - 19:00 Cycling, numbered spots; place n°9 is free
- **Saturday 21:** 10:00–10:45 Cycling, Leila, Studio vélo, 16/16, «Complet · 3 en attente». Amira is «En attente #2»; later she is promoted to place n°11 («Place confirmée»).
- **Sunday 22:** one 09:30 Body Pump.
- **Monday 23 – Wednesday 25:** the same as Thursday.

**Business figures**
- **Dashboard:**
  - 412 active members out of 538 registered (+27 this month)
  - Revenue «21 480 DT», «+12 % vs mois dernier», «1 320 DT aujourd’hui»
  - 186 entries today (152 unique visitors, 4 refused); peak hour 18h
  - 19 memberships to renew; 5 classes today, 3 people on waiting lists, 6 no-shows in 30 days
  - Plan mix: Mensuel 150, Trimestriel 180, Annuel 82
  - Women 38 %, men 57 %, not stated 5 %
- **Performance (1–19 nov.):**
  - GMV 27 650 DT. NMV 26 020 DT, after 1 120 DT of discounts, 240 DT of refunds and 270 DT of cancellations.
  - Marge brute 24 790 DT (95 %); Marge opérationnelle 7 410 DT (28 %).
  - Encaissé 25 330 DT; MRR 33 300 DT; ARPU 58 DT.
- **Payroll (October):** total net 9 850,000 DT. Ahmed Kchaou: base 1 400,000 DT, «168 h, 18 séances», commissions 324,000 DT, deductions −50,000 DT, net 1 674,000 DT.
- **Team hours (past week, 9–15 Nov):** Hela «40 h» / «39,7 h pointées»; Moez «16 h» / «12 h pointées».

**Shop and workflows**
- **Shop products:**
  - Eau minérale 0,5 L 1,500 DT · Boisson isotonique 4,000 DT · Barre protéinée 6,500 DT
  - Shaker 18,000 DT · Whey protéine 1 kg 135,000 DT
  - T-shirt Meliora 35,000 DT · Serviette Meliora 25,000 DT · Cadenas 12,000 DT
  - Séance de coaching (a service) 45,000 DT
- **Sample sale:** «V-2026-000412», 31,500 DT.
- **Workflows:**
  - «Accueil d’un nouveau membre» (event «Nouveau membre inscrit», 5 tasks)
  - «Ouverture de la salle» («Du lundi au samedi à 5h45»)
  - «Relance des abonnements expirés» (event «Abonnement expiré»)
  - «Stock bas : commande fournisseur» (event «Stock bas»)
  - Sample run: «Onboarding Skander Gharbi», 3/5.

**Rules for mock data:** demo e-mails use @example.com. CIN, CNSS and RIB numbers are obviously fake (00000000).

---

## 4. Signature moments

**★ Bold moments.** There is one per surface; spend the most visual care here.
1. **WEB-02 Website hero: the hexagon LED ceiling.**
   - The gym's real honeycomb ceiling, rebuilt in 3D.
   - Thin cool-white tubes flicker on in a wave, then the camera drifts with the pointer.
   - It must read as *this* gym, not as a sci-fi grid.
2. **APP-15 → APP-17 Pass and door.**
   - **The pass.** A white QR tile inside a red countdown ring that drains over 30 s, then cross-fades to the next code. It works offline, and it must be calm and readable at a glance.
   - **The door.** A giant red «Ouvrir» button, a locating pulse, then «Ouverture…». The result is either a green, springing «Porte ouverte», or a red «Accès refusé» with the exact reason and a next step.
3. **ADM-13 Reception kiosk verdict.** The same verdict, full-bleed, readable from 1.5 m.

**◆ Precision moments.** These need clarity, not decoration.
4. **APP-12 / ADM-07 Spot picker.**
   - Numbered bikes shown as squares: free, taken (dashed border and a person icon), yours, and selected (springs to 108%).
   - Staff see the same numbers with booked and present states.
5. **ADM-03 / ADM-12 Live access feed.**
   - Each door event flashes in as a row: a green or red dot, the name, the method, the door and «il y a 2 minutes».
   - A clear indicator shows whether the feed is live, connecting or offline.
6. **ADM-29 Team calendar.**
   - A week grid of shift chips in position colours, with planned vs clocked hours.
   - A day Gantt with a current-time line and the clocked-presence bar under each shift.
7. **ADM-16 / ADM-17 Workflow editor and run view.**
   - A calm canvas: task nodes with grey input handles and red output handles, dependency arrows and a 360 px inspector.
   - The run view colours each node by status and animates the edges that leave in-progress tasks.
8. **ADM-30 Performance.**
   - Seven KPIs with plain-language notes, and a period picker.
   - Grouped bars and a margin line, each with a table twin.
   - A breakdown table of subscriptions vs shop.

---

## 5. Member app (APP): iOS and Android, dark only, phone portrait

**Shell rules (they apply to every screen)**
- **Navigation:**
  - Signed out: Sign in ↔ Register.
  - Signed in: 5 tabs. Switching tabs uses the shift transition.
  - The door opens as a sheet with a grabber and a round close button.
  - Edit profile, change password and add weigh-in open as modal screens. They have a header with the title and a round X, and no grabber.
  - 3 pushed screens (class detail, program detail, history) slide in from the right, or from the left in Arabic. They have a round 36 px back button.
- **Refresh:** pull-to-refresh shows a red spinner on Home, Classes, Training, Profile and History. On Pass the refresh runs without a spinner.
- **Session:**
  - A member with a cached session opens straight on Home, even offline.
  - **Silent sign-out:** the session is wiped and the member lands on Sign in, with no message, in these cases:
    - the refresh token is rejected
    - the server reports a role other than member
    - the server answers 401, 403 or 404
  - When the server is unreachable, the member stays signed in.
- **Shared states:**
  - **Loading:** a red spinner and «Chargement…».
  - **Error:** a 56 px `red-soft` circle with a cloud-offline icon, the message, and a small secondary «Réessayer».
  - **Empty:** a 56 px icon circle, the message and an optional action.
  - **Network error copy:** «Impossible de joindre le serveur. Vérifiez votre connexion internet.»
- **Offline:** Home and Pass keep their cached data; the other screens show the error state.
- **Haptics:** most actions have one. Note them in the prototype.

**APP-01 Splash, app icon and launch.** A native splash only, shown while fonts, language and session load.
- **Content:**
  - The logo, about 200 px wide, on white #FFFFFF.
  - The app icon and the Android adaptive icon, on white (files in §1).
  - The fade from the white splash to the dark app (#0B0B0C).
- **Rules:**
  - Nothing else is drawn, so French never flashes before the language is known.
  - Mark the logo «needs vector original»: the source is only 150 px.

**APP-02 Sign in.** E-mail and password login, for members only.
- **Layout (AuthShell):**
  - `facade.jpg` fills the top 62%, under a gradient from 25% to 85% black that ends in solid #0B0B0C.
  - The content sits at the bottom and moves up with the keyboard.
- **Content:**
  - A logo tile at 80 px (**Change:** 88 in code).
  - «Meliora Gym · Sousse» in the label style, in `text-2`.
  - Display «Bienvenue» and the subtitle «Forge ta meilleure version».
  - «E-mail», with the placeholder «vous@exemple.tn» and the e-mail keyboard.
  - «Mot de passe», with an eye toggle («Afficher le mot de passe» / «Masquer le mot de passe»).
  - A form error box: `red-soft` fill, `red-700` hairline, `red-300` text.
  - Large primary «Se connecter».
  - Footer «Pas encore de compte ?» with the red link «Créer un compte».
- **Actions:**
  - The keyboard's next key moves to the password field.
  - Submit with the button or the keyboard's go key.
  - Show or hide the password.
  - Open Register.
- **States:**
  - Idle; focused field; submitting (spinner, disabled).
  - Inline errors: «Adresse e-mail invalide», «Champ obligatoire».
  - Errors in the box:
    - «E-mail ou mot de passe incorrect.»
    - «Ce compte est désactivé. Contactez l’accueil.»
    - A staff account: «Cette application est réservée aux membres. Utilisez l’espace administration sur le web.»
    - The network error.
    - Timeout: «Le serveur met trop de temps à répondre. Réessayez.»
    - Fallback: «Une erreur est survenue.»
  - Keyboard open; Arabic RTL.
  - A silent sign-out lands here with no message.
  - There is no "forgot password" link (see Proposals).

**APP-03 Register.** A self-service member account. The subscription is activated later, at the front desk.
- **Layout:** the same AuthShell hero, with a long scrolling form.
- **Content:**
  - Title «Rejoindre Meliora» and the subtitle «Créez votre compte membre, puis passez à l’accueil pour activer votre abonnement.»
  - Fields:
    - «Prénom» and «Nom», side by side.
    - «E-mail».
    - «Téléphone (facultatif)», placeholder «+216 …».
    - «Date de naissance (AAAA-MM-JJ) (facultatif)», placeholder «1998-04-21». This is typed text; there is no date picker (see Proposals).
    - «Genre (facultatif)», a segmented control «—» «Homme» «Femme».
    - «Mot de passe» with the hint «8 caractères minimum», then «Confirmer le mot de passe». Both have eye toggles.
  - The error box; large «Créer mon compte»; footer «Déjà membre ?» with «Se connecter».
- **States:**
  - Validation errors, each with a warning haptic:
    - «Champ obligatoire», «Adresse e-mail invalide», «8 caractères minimum», «Les mots de passe ne correspondent pas»
    - «Format attendu : AAAA-MM-JJ», which also fires for a future date or a year of 1900 or earlier
  - Submitting.
  - Errors: «Un compte existe déjà avec cet e-mail.», network, timeout, and members-only.
  - Success lands on Home in the «Aucun abonnement» state.

**APP-04 Tab bar.**
- **Bar:** `surface` with a hairline top border; 88 px on iOS and 68 on Android; 11 px labels.
- **Tabs:**
  - «Accueil» (home icon), «Cours» (calendar), «Training» (barbell), «Profil» (person).
  - «Training» stays: «Entraînement» doesn't fit a tab at 360 px or at 130% text size.
  - **«Pass»** sits in the centre:
    - a raised 48 px red circle with a QR icon
    - it overlaps the bar by 22 px and has a 3 px ring in the background colour
    - `red-700` when inactive, `red-500` when active
- **Translations:**
  - EN: Home / Classes / Pass / Training / Profile
  - AR: الرئيسية / الحصص / البطاقة / التمارين / حسابي
- **States:**
  - Active tabs are white, with a filled icon.
  - Inactive tabs are `text-3`, with an outlined icon. **Change:** today's #6B6B75 fails contrast.
  - The bar hides while the keyboard is open.
  - The tab order mirrors in RTL.

**APP-05 Home (Accueil).** The daily dashboard: membership status, one-tap door opening, shortcuts, visits, the next class and training.
- **Layout (top to bottom, with a staggered entrance):**
  - header
  - membership card
  - door card
  - 2 quick tiles
  - 3 stat tiles
  - «Prochain cours»
  - training card
- **Content:**
  - **Header:** «jeudi 19 novembre», display «Salut, Amira», «Prêt pour la séance ?», and a 52 px logo tile on the end side.
  - **Membership card:** see APP-06.
  - **Door card:**
    - A diagonal gradient from `red-500` to `red-700`, min-height 88, radius 18.
    - A lock-open icon in a 52 px rgba(0,0,0,.24) circle.
    - Title «Ouvrir la porte» and the caption «Devant la salle, ouvrez la porte depuis votre téléphone» in solid white.
    - A chevron.
  - **Quick tiles:** «Mon pass QR» (QR icon) and «Réserver un cours» (calendar icon).
  - **Stat tiles:** flame «Visites ce mois» 11 · trophy «Visites au total» 214 · clock «Dernière visite» «17 nov.», or «Jamais».
  - **Next class:**
    - The section header «Prochain cours» with the red link «Voir le planning».
    - It shows the next **booked** class only, never a waitlisted one. The date label is «Aujourd’hui», «Demain» or the date.
    - Sample class card: Cycling, «Aujourd’hui», 19:00–19:45, Leila, Studio vélo, the pill «Réservé · Place n°7», and the button «Gérer».
  - **Training card:** a barbell in a `surface-3` circle, «Mon entraînement», «Programme, progression et coaching», and a chevron.
- **Actions:**
  - Pull to refresh.
  - Door card → APP-16 (medium haptic).
  - «Mon pass QR» → Pass. «Réserver un cours» → Classes.
  - Any stat tile → History.
  - «Voir le planning» → Classes.
  - Class card or «Gérer» → class detail.
  - Training card → Training.
- **States:**
  - Loading: the header stays, with a spinner below it.
  - Error with no cache; offline with cached data (no error shown).
  - No upcoming booking: a calendar card «Aucun cours réservé». A booking load error shows the same card.
  - The membership-card variants.
  - Zero visits («0», «Jamais»).
  - RTL: the logo on the left, chevrons mirrored.

**APP-06 Membership card (the Home hero).**
- **Card:**
  - Radius 24, min-height 230.
  - `shield-sign.jpg` under a gradient (55% → 92% → solid #0B0B0C).
  - A 4 px red bar on the start edge.
- **Content:**
  - Top row: the overline «Abonnement» and a status pill.
  - The plan name in display type: «Trimestriel».
  - When active: «23» (hero-num) followed by «jours restants» («jour restant» when the count is 1), then «Valable jusqu’au 12 décembre 2026».
  - When a renewal is queued: «Renouvellement prévu le 13 décembre 2026».
  - Footer, under a hairline: «Membre» with «Amira Jaziri», and on the end side «N° membre» with «MEL-00042», letter-spaced.
- **Design all 7 states:**
  1. «Actif», more than 7 days left: the number in green.
  2. «Actif», 7 days or fewer: amber.
  3. «Actif», 3 days or fewer: red.
  4. «Gelé»: a blue pill, no countdown.
  5. «Expiré»: a red pill, «Expiré le 31 octobre 2026», and «Passez à l’accueil de la salle pour renouveler votre abonnement.»
  6. «Suspendu»: red. It overrides every other state.
  7. «Aucun abonnement»: a grey pill and «Passez à l’accueil de la salle pour choisir votre formule.»
- **Screen readers:** the card reads as one label, «Trimestriel, Actif».

**APP-07 Classes: Planning.** Browse the next 7 days of group classes, and book or join a waiting list in one tap.
- **Layout:**
  - Display «Cours collectifs» and a segmented control «Planning» «Mes réservations».
  - The strike banner (APP-10), when relevant.
  - A horizontal day strip of 7 chips, 56 px wide, starting today.
    - Each chip shows «jeu», the day number, and a red dot when the day has classes.
    - The selected chip is filled red, and its dot turns white.
    - In Arabic, chips fit the full weekday («الأربعاء»).
  - Class cards, sorted by time.
- **Content:**
  - **Today:**
    - HIIT Express and Body Pump: «Terminé»
    - Cross-training: «Réservations clôturées»
    - Cycling, booked: «Réservé · Place n°7», «Gérer»
    - HIIT Express 20:15: «4 places restantes», «Réserver»
  - Also draw the Friday chip selected. It shows Cross-training «Complet · 3 en attente» with «Rejoindre la liste d’attente», and Cycling with «Choisir ma place».
- **Actions:**
  - Pick a day (selection haptic).
  - «Réserver» books immediately and shows a toast.
  - «Rejoindre la liste d’attente» joins immediately and shows a toast with the position.
  - «Choisir ma place», or a tap on the card, opens the class detail.
  - Pull to refresh.
- **States:**
  - Loading; error; an empty day: «Aucun cours ce jour-là.»
  - Blocked by strikes: the banner shows, and every bookable card shows the red caption «Réservations suspendues» with no button.
  - Busy: a spinner in the tapped button.

**APP-08 Classes: Mes réservations.**
- **Content:**
  - **«À venir»:** booked and waitlisted bookings, soonest first.
    - Today's Cycling, «Aujourd’hui», «Réservé · Place n°7».
    - Saturday's Cycling, «sam 21 nov.», «En attente #2».
    - Each has «Gérer».
  - **«Passées»:** up to 20 bookings, not tappable.
    - 17 nov. Body Pump «Présent», 12 nov. Cycling «Absent», 10 nov. HIIT Express «Annulé tardivement».
    - A class that ended with no recorded attendance keeps «Réservé» or «En attente».
  - Cancelled bookings are hidden.
- **States:**
  - Loading and error.
  - Nothing at all: a bookmark icon, «Vous n’avez aucune réservation à venir.» and a «Planning» button.
  - Only past bookings.
  - With the banner.

**APP-09 Class card (component sheet).**
- **Anatomy:**
  - A `surface` card, radius 18, with a 4 px start stripe in the class colour.
  - A 64 px time column: an optional date label, «19:00» in the `time` style, and the end time as a caption.
  - The title, on one line.
  - A meta row: a person icon with the coach, a pin with the room, and, for classes with numbered spots, a grid icon with «Choisissez votre place».
  - A 4 px capacity bar in the class colour (grey when full), with «4 places restantes» or «Complet · 3 en attente» (warning).
  - A footer aligned with the title: the status or pill on the start side, the action on the end side.
- **Variants:**
  - book: «Réserver» with +
  - chooseSpot: «Choisir ma place»
  - waitlist: «Rejoindre la liste d’attente», hourglass icon, secondary
  - full: «Liste d’attente complète»
  - notOpen: «Réservations ouvertes le 26 nov. 18:00»
  - closed: «Réservations clôturées»
  - past: «Terminé» (neutral)
  - blocked: red «Réservations suspendues»
  - the member's own booking pills. «Gérer» appears only for booked and waitlisted bookings.
  - busy; pressed (85% opacity); the non-tappable past version

**APP-10 Strike / suspension banner.**
- **Warning:** a `warning-soft` banner with an alert icon: «2/3 absences ou annulations tardives sur 30 jours».
- **Blocked:** a `red-soft` banner with a `red-700` hairline, a ban icon and the alert role. Bold «Réservations suspendues», then «Trop d’absences ou d’annulations tardives : vous pourrez réserver à nouveau le 26 novembre, 18:00.»
- **Hidden** when there are no strikes.

**APP-11 Class detail.** Everything about one class. From here the member books, picks a spot, joins or leaves the waiting list, or cancels.
- **Layout:**
  - Top bar: the round back button and «Détails du cours».
  - The header card, with the class-colour stripe.
  - The banner.
  - The status card.
  - Info lines.
  - The spot picker (classes with numbered spots).
  - A sticky bottom bar with a hairline top border and one large button.
- **Content:**
  - **Header card:** «Cycling», «jeudi 19 novembre · 19:00 – 19:45», «Coach Leila Mzoughi», a pin with «Studio vélo», and the description in `text-2`.
  - **Status card:** the pill «Réservé · Place n°7»; a large «4 places restantes», or «Complet» in warning; the caption «12/16 places · 0 en attente».
  - **Info lines:**
    - clock: «Réservations ouvertes le …»
    - lock: «Réservations clôturées»
    - shield: «Annulation gratuite jusqu’au samedi 21 novembre · 08:00», or in amber «Délai d’annulation dépassé depuis le jeudi 19 novembre · 17:00»
    - walk: «Votre présence est validée automatiquement à votre passage à la porte (dès 30 min avant le début).»
    - bell: «Si une place se libère, elle vous est attribuée automatiquement et vous recevez une notification.»
- **Sample frames:**
  - Today's Cycling: booked, and past the free-cancellation deadline, so only the amber line shows.
  - Saturday's Cycling: waitlisted, then booked on place n°11 with «Annulation gratuite jusqu’au samedi 21 novembre · 08:00».
  - Friday's Cycling: the booking flow with place n°9.
- **Actions:**
  - Large primary «Réserver».
  - Classes with numbered spots: pick a spot, then «Réserver la place n°9». Until a spot is picked, the button is disabled and reads «Choisissez une place libre.».
  - Large secondary «Rejoindre la liste d’attente».
  - Large danger «Annuler» or «Quitter la liste d’attente». Each opens APP-13.
  - Disabled «Liste d’attente complète».
  - Opened cold from a push: the back button replaces the screen with Classes.
- **States:**
  - Loading; error; «Ce cours est introuvable ou terminé.»
  - Not open, closed, past or blocked: no button, and an explanatory line instead.
  - Booked before vs after the cancellation deadline.
  - Waitlisted, with the position.
  - Attended, no-show or late-cancelled: the pill only, and an empty bottom bar.
  - Busy.

**APP-12 ◆ Spot picker.**
- **Layout:** an inline section «Choisissez votre place», with a wrapping grid of 48 px numbered squares from 1 to 16 (radius 8, gap 8).
- **Square states:**
  - **Free:** `surface-2`, `field-border`, the number in `text`.
  - **Taken:** `bg` with a dashed `field-border` and a person icon. Disabled.
  - **Yours:** a 2 px red border on `red-soft`.
  - **Selected:** solid red with a white number, springing to 108%.
- **Legend:** «Libre», «Prise», and «Votre place» or «Choisissez votre place».
- **States:**
  - Selectable.
  - Read-only once booked.
  - Hidden when waitlisted, and for classes without numbered spots.
  - Race condition: the toast «Cette place est déjà prise.».
  - Accessibility: a radiogroup in which each spot reads «Place n°9, Libre».

**APP-13 Cancel or leave-waitlist confirmation (native alert).**
- **Titles:** «Annuler» or «Quitter la liste d’attente».
- **Messages:** «Annuler votre réservation pour « Cycling » ?» or «Quitter la liste d’attente de « Cycling » ?».
- **Late variant:** adds «Le délai d’annulation est dépassé : cette annulation comptera comme une absence (3/3 sur 30 jours).», with a warning haptic.
- **Buttons:** «Non» and «Oui» (destructive). Draw the iOS and Android versions.
- **Result toasts:** «Réservation annulée», «Annulation tardive enregistrée» (error tone), «Vous avez quitté la liste d’attente», «Impossible d’annuler une séance déjà commencée.»

**APP-14 Booking feedback.** There is no confirmation sheet: booking is one tap followed by a toast.
- **Success:** «Réservation confirmée · Place n°9», or plain «Réservation confirmée» for a class without numbered spots.
- **Waitlist (info):** «Vous êtes n°2 sur la liste d’attente».
- **Server errors (French):**
  - «Séance complète.»
  - «Cette place est déjà prise.»
  - «Choisissez une place (1 à 16).»
  - «Vous avez déjà réservé cette séance.»
  - «Vous êtes déjà sur la liste d’attente de cette séance.»
  - «Les réservations sont fermées pour cette séance.»
  - «Les réservations ouvrent le {date}.»
  - «Cette séance a déjà commencé.»
  - «Abonnement inactif : renouvelez votre abonnement pour réserver.»
  - «Réservations suspendues jusqu’au 26/11/2026 (trop d’absences ou d’annulations tardives).»

**APP-15 ★ Pass (Mon pass).** The rotating QR code for the door reader. It works offline, and the screen brightness is forced to 100% while the tab is open.
- **Layout:** a centred column.
- **Content:**
  - Display «Mon pass» and the label «Présentez ce code au lecteur de l’entrée».
  - The QR code:
    - black, on a 220 px white tile (radius 18, `float` shadow), inside a 284 px ring
    - the ring drains in red over a `surface-3` track during each 30 s period
    - draw a real-looking QR code, not a decorative pattern
  - «Nouveau code dans 12 s», ticking every second.
  - «Amira Jaziri · N° membre MEL-00042» and the status pill.
  - Banners when relevant; the sun hint «Luminosité augmentée pour la lecture»; and the secondary button «Ouvrir la porte avec l’app» (lock-open icon).
- **States:**
  - The ring at 30 s, 12 s and 3 s, plus the cross-fade frame when the code changes.
  - Offline: an `info-soft` banner «Hors ligne — le code reste valable». The QR code keeps rotating.
  - Inactive membership: a `red-soft` banner «Abonnement inactif : l’accès sera refusé.», with the Gelé, Expiré, Suspendu or Aucun abonnement pill.
  - Loading with no cached key.
  - Pass not ready: «Votre pass n’est pas encore disponible. Réessayez dans un instant.» with «Réessayer».
  - Error with no cached key.
  - Profile not loaded: only «N° membre MEL-00042», no pill.

**APP-16 ★ Door modal (Ouvrir la porte).** Opens the gym door remotely, after a GPS check (§3) and a subscription check.
- **Layout:**
  - A sheet with a grabber and a round close X at the top end.
  - Display «Ouvrir la porte» and the label «Choisissez la porte. Votre position est vérifiée : vous devez être devant Meliora Gym.»
  - The door choice.
  - A giant 168 px red circular button with a 6 px rgba(255,255,255,.16) ring, a lock-open icon, and «Ouvrir» in uppercase.
  - A status text area below the button.
- **Door choice:**
  - Several doors: radio cards «Entrée principale · Rez-de-chaussée» and «Studio · 1er étage». The selected card has a red border.
  - One door: a single line with a building icon.
- **Actions:**
  - Pick a door (selection haptic).
  - «Ouvrir» (heavy haptic) runs three steps:
    1. Ask for location permission. The OS prompt reads «Meliora Gym utilise votre position uniquement pour vérifier que vous êtes devant la salle avant d’ouvrir la porte.»
    2. Get a GPS fix.
    3. Send the open request.
  - «Ouvrir les réglages», when permission was permanently denied.
  - Close with the X or by swiping down.
- **States:**
  - Doors loading; error.
  - No doors: a lock icon and «Aucune porte n’est configurée pour le moment.»
  - Idle. With several doors, the button stays disabled (`red-700`) until one is chosen.
  - Locating: the label becomes «…», a red pulse halo shows, and «Vérification de votre position…».
  - Opening: «Ouverture…».
  - Permission denied: «L’accès à la position est nécessaire pour ouvrir la porte à distance.» with «Ouvrir les réglages».
  - No position: «Position introuvable. Activez la localisation et réessayez.»
  - Network and timeout errors.
  - Reduced motion: no pulse.

**APP-17 ★ Door result.**
- **Granted:**
  - A 140 px `success-soft` circle with a lock-open icon that springs in.
  - «Porte ouverte», «Bon entraînement Amira !», the caption «Entrée principale», and a large «Terminé».
  - Granting access also refreshes the visit stats on Home.
- **Denied:**
  - A `red-soft` circle with an X, «Accès refusé», the reason and the door name.
  - A large «Réessayer» (refresh icon) and the secondary «Utiliser plutôt mon pass QR» (QR icon).
- **Actions:**
  - «Terminé» closes the modal.
  - «Réessayer» returns to idle.
  - «Utiliser plutôt mon pass QR» closes the modal and opens the Pass tab.
- **Denial frames, one per group:**
  - Distance: «Vous êtes trop loin de la salle (350 m). Approchez-vous de l’entrée.»
  - Subscription:
    - «Aucun abonnement actif. Merci de passer à l’accueil.»
    - «Abonnement expiré le 01/11/2026. Merci de le renouveler.»
    - «Abonnement valable à partir du 05/11/2026.»
    - «Compte suspendu. Merci de passer à l’accueil.»
  - Hardware: «Porte désactivée.», «Contrôleur de porte hors ligne.», «Le contrôleur de porte ne répond pas.»
  - GPS: «Position GPS invalide. Activez la localisation.»
  - Server: «Erreur du serveur, réessayez.»
  - Fallback: «Une erreur est survenue.»

**APP-18 Training: Programme.**
- **Layout:** display «Entraînement» and a segmented control «Programme» «Progression» «Coaching».
- **Program card:**
  - A barbell in a `surface-3` circle, and «Prise de masse, 4 jours» (2 lines at most).
  - «Par Sami Haddad · 8 semaines».
  - «Objectif» with «Gagner 3 kg de masse musculaire d’ici février».
  - Day chips «Jour 1 6», «Jour 2 5»…
  - «Depuis le 3 novembre 2026» and a chevron.
- **States:**
  - Loading; error.
  - Empty: «Aucun programme actif. Demandez à votre coach de vous en préparer un.»
  - The content fades when the segment changes.
  - Programs are read-only here.

**APP-19 Program detail (workout checklist).**
- **Content:**
  - A top bar with back and the program title, then «Objectif» with the goal.
  - Day pills, with the active one in red.
  - «2/6 faits», plus a ghost «Réinitialiser» once something is ticked.
  - A 6 px green progress bar that animates as it fills.
- **Checklist rows:**
  - A 28 px round checkbox: green with a white tick when done.
  - The exercise name. When done, it is struck through and the row dims to 60%.
  - «4 séries · 8-10 reps · 60 kg · repos 90 s».
  - Coach notes in `text-2`: «Descente contrôlée, 3 s».
  - Sample exercises: Développé couché, Squat barre, Rowing barre, Développé militaire, Curl biceps, Gainage planche.
- **Rules:** ticks are stored on the device per program, day and date, so each day opens unticked.
- **States:** loading; error; not found; all done (today only a haptic; see Proposals).

**APP-20 Training: Progression.**
- **Stat tiles:**
  - «Poids»: «78,5 kg» with «↓ -2,5 kg · Évolution».
  - «IMC»: «24,1» with a pill: «Corpulence normale», «Insuffisance pondérale», «Surpoids» or «Obésité».
  - Missing values show «—».
- **Chart card:**
  - The heading «Poids», «Masse grasse» or «Tour de taille», and «Dernière mesure · 17 nov.».
  - Metric chips appear only when more than one metric has data.
  - A 210 px line chart:
    - a 2 px red line, and dots with a surface ring
    - a hairline grid with Y ticks; the first and last dates on the X axis
    - the latest value labelled
  - Touch and drag shows a crosshair and a tooltip. The axis runs left to right, even in Arabic.
- **Below the chart:**
  - Primary «Ajouter ma pesée».
  - «Historique» rows: date | kg | % | cm, newest first, with tabular figures and «—» for missing values.
  - Sample: 8 weigh-ins from 81,0 to 78,5 kg.
- **States:**
  - Loading and error.
  - Empty: an analytics icon, «Aucune mesure pour le moment. Ajoutez votre première pesée.» and the button.
  - A single measurement: one centred dot.
  - A metric with no data.
  - BMI missing, because staff haven't recorded the height.

**APP-21 Add weigh-in (modal screen).**
- **Content:**
  - «Ajouter ma pesée» with a close button.
  - «Poids (kg)»: autofocus, decimal pad, placeholder «72,5».
  - «Masse grasse (%) (facultatif)», placeholder «18».
  - «Tour de taille (cm) (facultatif)», placeholder «82».
  - Large «Enregistrer».
- **Rules:** there is no date field (the measurement is dated today). A comma or a dot both work as the decimal separator.
- **States:** «Champ obligatoire»; «Nombre invalide»; saving; server error; the success toast «Mesure enregistrée»; keyboard open.

**APP-22 Training: Coaching (read-only).**
- **Sections:** «À venir» and «Passées».
- **Card:**
  - «18:00» with «24 nov.».
  - «Coach Ahmed Kchaou» and «24 nov., 18:00 – 19:00».
  - Notes, on 2 lines.
  - A pill: «Planifiée», «Effectuée», «Annulée» or «Absent».
  - «45,000 DT» when the price is above 0.
- **States:** loading; error; empty «Aucune séance de coaching personnel.»; only upcoming; only past.

**APP-23 History (Historique).**
- **Layout:** a pushed screen with a back-only top bar and the display title «Historique». A segmented control «Visites» «Paiements» «Abonnements» opens on Visites. The rows sit in one card, with hairline dividers.
- **Visites (last 50):**
  - A 38 px icon tile per method: «Pass QR», «Application», «Badge», «Empreinte», «Accueil». The tile is green when access was granted and red when it was denied.
  - «Accès autorisé» or «Accès refusé», then «Pass QR · Entrée principale».
  - The reason, in red: «QR code expiré. Actualisez le code dans l’application.» or «QR code déjà utilisé. Attendez le prochain code.»
  - «17 nov., 18:04» on the end side.
- **Paiements:**
  - A receipt icon, «Trimestriel», «Espèces · 13 septembre 2026» and «240,000 DT».
  - A payment with no plan shows «Abonnement».
- **Abonnements:**
  - A ribbon icon in `text-2`, the plan, «Du 14 septembre 2026 au 12 décembre 2026», a pill and the price.
  - A past «Expiré» is neutral here.
- **States:** loading and error per segment; empty «Aucune visite enregistrée.», «Aucun paiement enregistré.», «Aucun abonnement.»

**APP-24 Profile (Profil).**
- **Identity:** a 72 px `surface-3` circle with «AJ» in `text`; «Amira Jaziri», «MEL-00042», «Membre depuis 12 mars 2025».
- **Personal info:**
  - «Informations personnelles», with the red link «Modifier le profil».
  - Rows «E-mail», «Téléphone», «Date de naissance» and «Contact d’urgence». Empty values read «Non renseigné».
- **Menu:**
  - «Historique» ›
  - «Changer le mot de passe» ›
  - «Notifications», with «Activées» or «Désactivées»
  - «Langue», with a segmented control «Français» «English» «العربية»
- **«La salle» card:**
  - The logo tile, «Meliora Gym» and the address.
  - A «Horaires» box: «Lun – Sam 06:00 – 22:00», «Dimanche 08:00 – 14:00».
  - Small buttons «Itinéraire», «Appeler» and «Instagram».
  - «Appeler» always shows and dials the stored number, even the placeholder. Add a variant without it (§3).
- **Footer:** danger «Se déconnecter» and «Version 1.0.0».
- **States:** the member part loads or errors on its own, while the gym card, logout and version still render. The gym card stays hidden until it loads.

**APP-25 Language switch and restart dialogs.**
- Switching between French and English applies instantly.
- Switching to or from Arabic opens the alert «Changer de langue» / «L’application va redémarrer pour passer en العربية.» with «Annuler» and «Redémarrer».
- Fallback alert: «Fermez puis rouvrez l’application pour appliquer le sens d’affichage.»
- Show Profile before and after the RTL flip.

**APP-26 Notifications row and permission.**
- Row states:
  - Granted: «Activées».
  - Denied: «Désactivées»; tapping opens the OS settings.
  - Unavailable: «Désactivées», not tappable.
- The OS prompt appears right after sign-in. Today there is no priming screen (see Proposals).

**APP-27 Logout confirmation (native alert).** «Se déconnecter» / «Voulez-vous vous déconnecter ?» with «Annuler» and «Se déconnecter» (destructive).

**APP-28 Edit profile (modal screen).**
- **Content:**
  - «Prénom», «Nom» and «Téléphone», prefilled.
  - «Date de naissance (AAAA-MM-JJ)».
  - «Contact d’urgence», with the placeholder «Nom et téléphone».
  - E-mail and gender cannot be edited.
  - «Enregistrer».
- **States:** loading; error; validation; saving; server error; the success toast «Profil mis à jour».

**APP-29 Change password (modal screen).**
- **Content:** «Mot de passe actuel», «Nouveau mot de passe» (hint «8 caractères minimum») and «Confirmer le mot de passe», each with an eye toggle, and «Enregistrer».
- **States:** validation; saving; «Mot de passe actuel incorrect.»; the success toast «Mot de passe modifié».

**APP-30 Push notifications.** Always in French.
- **Where:** show the iOS lock screen, the Android shade (channel «Meliora Gym») and the in-app foreground banner.
- **Messages:**
  - «Place confirmée» (Amira): «Une place s’est libérée pour Cycling — vous êtes inscrit(e) (21/11 à 10:00, place n°11).»
  - «Rappel de séance» (Amira):
    - «Cycling commence à 19:00 (Studio vélo, place n°7).»
    - Variant without a room or place: «Cycling commence à 19:00.»
  - «Abonnement bientôt expiré» (Yassine):
    - «Votre abonnement Mensuel expire dans 2 jours (le 21/11/2026). Renouvelez-le à l’accueil pour garder votre accès.»
    - Variant: «Votre abonnement Mensuel expire aujourd’hui. Renouvelez-le à l’accueil pour garder votre accès.»
  - «Abonnement expiré» (Nour): «Votre abonnement Mensuel a expiré le 31/10/2026. Passez à l’accueil pour le renouveler.»
  - «Paiement reçu» (Amira):
    - «Merci Amira ! Paiement de 240,000 DT reçu pour Trimestriel.»
    - Variant without a plan: «Merci Amira ! Paiement de 240,000 DT reçu.»
- **Taps:**
  - Place confirmée and Rappel → class detail.
  - Both subscription pushes → Home.
  - Paiement reçu → History, opening on Visites.
  - When signed out, a tap is not routed.

**APP-31 Toast.**
- A pill under the status bar: `surface-3`, a hairline border and the `float` shadow, with an icon and up to 3 lines of 14 px medium text.
- Tones: success, error and info.
- It springs in, fades after 2.6 s, and shows one at a time.

---

## 6. Back-office (ADM): web at 1440 desktop, 1024 tablet and 390 phone, dark by default plus light

**Roles**
- **ADMIN (Administrateur):** sees everything.
- **STAFF (Accueil):**
  - Doesn't see Performance, Dépenses et résultats, Codes promo, Comptes équipe, Paie or Agents.
  - Offres et tarifs and Workflows are read-only.
- **COACH:** sees only Planning des cours (the coach's home page), Entraînement, Tâches and run details.

**ADM-00 Shell.**
- **Sidebar:** 256 px on the start side, `surface`.
  - Brand row: the logo tile, «Meliora Gym» (title style) and «Back-office».
  - Nav groups (overline titles, lucide icons):
    - (no title): «Tableau de bord»
    - Membres: «Membres», «Prospects»
    - Activité: «Planning des cours», «Entraînement», «Portes et accès», «Scanner QR»
    - Organisation: «Tâches», «Workflows»
    - Opérations: «Boutique», «Salles et équipements», «Employés», «Calendrier de l’équipe»
    - Finance: «Performance», «Paiements», «Dépenses et résultats», «Codes promo»
    - Administration: «Offres et tarifs», «Comptes équipe»
  - The active item has a `surface-2` fill, semibold text and a 3 px red start bar.
- **Top bar:** 56 px, sticky, in the page colour at 85% with a blur.
  - A hamburger below 1024 px.
  - The language pills «FR» «EN» «ع».
  - «Voir le site», with an external-link icon.
  - The sun and moon theme toggle.
  - User block: an initials avatar, «Mehdi Saidi», «Administrateur», and a logout icon («Se déconnecter»).
- **Content area:**
  - Max-width 1400.
  - Page header: the title, a one-line description, and actions on the end side.
- **Drawer:** 288 px, from the start side, over `overlay`, with «Fermer le menu».
- **States:** dark and light; LTR and RTL; the Admin, Accueil and Coach navs; hover, active and focus; the drawer at 768 and at 390.

**ADM-01 Login (Espace équipe).**
- **Layout:**
  - From 1024 up, the page is split:
    - The start half shows `facade.jpg` at 70% under a black gradient, with «Meliora Gym» in display type and «Khzema Est, Rue Colonel Garnaoui, Sousse».
    - The end column (max 384 px) holds the form.
  - Below 1024, only the form column shows.
- **Form column:**
  - The language pills, and a 48 px logo tile that links to the site.
  - «Espace équipe» and «Connexion réservée au personnel de la salle. Les membres utilisent l’application mobile.»
  - «E-mail», «Mot de passe» and a full-width «Se connecter».
- **States:**
  - Idle; submitting.
  - Wrong credentials.
  - Member account: «Cet espace est réservé à l’équipe Meliora. Les membres utilisent l’application mobile.»
  - Rate limit, after too many attempts.
  - Already signed in: redirect.

**ADM-02 System states.**
- Session loading: «Ouverture de la session…».
- Role gate: a shield-alert icon, «Accès réservé» and «Cette page est réservée à un autre rôle. Demandez l’accès à l’administrateur de la salle.»
- The confirm dialog (neutral and destructive), toasts, the inline error note, skeletons and the empty-state pattern.
- Modals at all four sizes, each with a header, a scrolling body and a footer; and one as a bottom sheet at 390.

**ADM-03 ◆ Dashboard (Tableau de bord).** For Admin and Accueil; coaches are sent to Planning. Admin also sees the Performance row.
- **Header:** «Tableau de bord» and «jeudi 19 novembre 2026».
- **KPI strip** (one card, hairline dividers):
  - «Membres actifs» 412: «sur 538 inscrits, +27 ce mois».
  - «Revenus du mois» «21 480 DT», «+12 % vs mois dernier», «1 320 DT aujourd’hui».
  - «Entrées aujourd’hui» 186: «152 visiteurs, 4 refus».
  - «Abonnements à renouveler» 19, with the amber status «À relancer cette semaine».
  - **Change:** «Cours aujourd’hui» 5, with «3 en liste d’attente, 6 absences sur 30 j». The code prints this class note under the renewal tile.
- **Admin row:** «Performance du mois» with «Voir le détail», then a strip of four values: GMV, NMV, Marge brute, Marge opérationnelle.
- **Charts** (each card has the «Tableau» / «Graphique» toggle):
  - «Revenus des abonnements» — «12 derniers mois, en dinars»: monthly bars at 2/3 width. The tooltip shows «encaissés» and «paiements».
  - «Répartition des offres» — «Membres actifs par offre»: horizontal bars at 1/3 width.
  - «Fréquentation» — «Entrées par jour, 30 derniers jours»: lines «Entrées» and «Visiteurs uniques».
  - «Heures d’affluence» — «Pic à 18h sur les 30 derniers jours».
- **◆ «Entrées en direct» — «Chaque passage aux portes, en temps réel»:**
  - Status: «En direct» (a green pulse), «Connexion…» or «Hors ligne».
  - Each row has a green or red dot and the name, or «Ouverture manuelle par Hela Gharsallah», «Ouverture manuelle» (no name) or «Inconnu».
  - Below the name: «Autorisé» or «Refusé : {reason}», then the method («QR code», «Application», «Badge», «Empreinte», «Manuel»), the door, and «il y a 2 minutes».
  - New rows flash in.
  - Use the real reasons:
    - «QR code invalide.»
    - «QR code expiré. Actualisez le code dans l’application.»
    - «QR code déjà utilisé. Attendez le prochain code.»
    - «Membre inconnu.»
    - «Porte non gérée par cet agent.»
    - the subscription reasons, for example Nour Mejri: «Abonnement expiré le 31/10/2026. Merci de le renouveler.»
- **«Fins d’abonnement cette semaine» — «À appeler pour le renouvellement»:** each row shows the name, the plan, «fin le 21 nov.», the phone and a badge: «J-5» in amber; «J-2», «J-1» or «Aujourd’hui» in red.
- **«Adhérents» section:**
  - A count strip: Inscrits 538, Actifs 412, Expirés 74, Gelés 9, Suspendus 3, Jamais abonnés 40.
  - «Départs sur 30 jours» 21 («Abonnements terminés sans renouvellement») and «Taux de renouvellement» 68 % («Abonnements terminés sur 90 jours et renouvelés»).
  - Charts: «Nouveaux membres», «Tranches d’âge» (the blue ramp), and «Répartition femmes / hommes» (a 100% stacked bar with percentages).
- **«Équipe» section** (with a link to «Calendrier de l’équipe»):
  - «Employés actifs»: 8 «sur 9», with a count per position and colour squares.
  - «En service maintenant»: «5 présents sur place».
    - Each row: a colour square, the name, «Accueil, 14:00–22:00» and the task.
    - Badges: «Pointé à 13:56» green, «Hors planning» blue, «Attendu à 19:00» amber, «En retard, non pointé» red, «Absent» red.
  - «Planning du jour»: a Gantt with one row per employee, bars in position colours, hour ticks, and a current-time line with an «18:45» chip.
- **«Opérations» section:** 6 link tiles, each with 2 metrics. A metric above 0 shows an alert icon and a red value.
  - Équipe: «Présents 5 / 8», «Congés à valider 1»
  - Salles: «Pannes ouvertes 2», «Entretiens dus 1»
  - Boutique: «Ventes du jour 312 DT», «Stocks bas 3»
  - Prospects: «Nouveaux ce mois 23», «Relances dues 4»
  - Entraînement: «Programmes actifs 37», «Séances PT du mois 18»
  - Tâches et workflows: «Tâches ouvertes 12», «En retard 2»
- **Actions:**
  - Open a member from the expiring list.
  - Open module pages from the tiles.
  - Switch between chart and table.
  - The page auto-refreshes every 60 s; the live feed arrives over a socket.
- **States:**
  - A skeleton and an error with «Réessayer» for each block.
  - Empty states: «Aucune entrée pour l’instant», «Aucun abonnement ne se termine cette semaine», «Personne n’est en service en ce moment».
  - The live feed's three states.
  - An Opérations tile showing «Service indisponible».
  - Charts dimmed while refetching.
  - The Admin and Accueil versions.

**ADM-04 Members: list and create (Membres).**
- **Header:** «Membres» — «Inscriptions, abonnements, paiements et badges d’accès.», with the primary «Nouveau membre».
- **Toolbar:** a debounced search «Nom, e-mail, téléphone ou code membre», and the tabs «Tous» «Actifs» «Expirés» «Suspendus».
- **Table (clickable rows):**
  - Columns: Membre (name and «MEL-00042»), Contact (phone and e-mail; hidden when narrow), Offre, Fin, Statut.
  - Statut badges follow §2.2 decision 7. The «Expirés» tab shows «Expiré».
  - Pagination: «1–20 sur 538».
- **Create modal (large): «Nouveau membre»** — «Le membre recevra un e-mail de bienvenue et pourra se connecter à l’application.»
  - Identity: Prénom*, Nom*, E-mail*, Téléphone (+216), Date de naissance, Genre («Femme» «Homme»), Contact d’urgence.
  - «Mot de passe de l’application», with the hint «Laissez vide : un mot de passe provisoire sera généré et affiché une seule fois.»
  - Fieldset «Abonnement»:
    - Offre: «Pas d’abonnement pour l’instant», or «Trimestriel, 240,000 DT».
    - Code promo, placeholder «RENTREE26». The hint goes from «Facultatif» to «Vérification…» to «Remise de 15,000 DT appliquée», or to an error.
    - «À payer» as a large amount: «225,000 DT».
    - «Encaisser le paiement maintenant».
    - «Moyen de paiement»: Espèces, Carte bancaire, Virement, D17.
    - «Référence», placeholder «N° de reçu, de transaction…».
  - «Notes internes».
  - Footer: «Annuler» and «Créer le membre».
- **Result modal: «Membre créé»**
  - «Skander Gharbi est inscrit sous le code MEL-00539.»
  - A key box «Mot de passe provisoire», in large selectable monospace, with «Affiché une seule fois. Donnez-le au membre pour sa première connexion à l’application.»
  - «Abonnement Trimestriel du 19 nov. 2026 au 16 févr. 2027.»
  - Buttons «Fermer» and «Ouvrir la fiche».
- **States:**
  - Skeleton rows; dimmed while refetching.
  - Empty: «Aucun membre pour l’instant» — «Inscrivez le premier membre de la salle.»
  - No results: «Aucun membre ne correspond» — «Vérifiez l’orthographe ou cherchez par numéro de téléphone.»
  - An invalid promo code.
  - Partial failure: the member was created but the subscription failed.
  - Toast: «Skander Gharbi est inscrit.»

**ADM-05 Member detail (fiche membre).**
- **Header:**
  - The back link «Membres», then «Amira Jaziri» with «MEL-00042 / Inscrit le 12 mars 2025» and a badge (§2.2 decision 7).
  - Buttons: «Paiements»; «Suspendre» (danger) or «Réactiver»; and «Supprimer» (Admin only; ghost, with a trash icon).
- **Tabs:** «Abonnement», «Paiements (4)», «Accès», «Profil», «Suivi physique».
- **Abonnement tab:**
  - Status card:
    - «Statut de l’abonnement», the badge, «Trimestriel» and «Accès jusqu’au 12 décembre 2026, 23 jours restants»
    - «Renouvellement payé : Trimestriel dès le 13 décembre 2026»
    - the primary «Renouveler»
  - Table «Historique des abonnements»: Offre, Période «14 sept. 2026 → 12 déc. 2026», Prix, Statut, and the row actions «Geler», «Dégeler» and «Annuler».
- **Renew modal: «Renouveler l’abonnement»** — «Accès valable jusqu’au 12 décembre 2026 : le nouvel abonnement démarre le lendemain par défaut.»
  - Fields: Offre*, Début («Laisser vide pour la date automatique»), Code promo, «À payer», «Encaisser le paiement maintenant», Moyen, Référence.
  - Button: «Enregistrer l’abonnement».
- **Freeze modal: «Geler l’abonnement»** — «L’accès est suspendu ; la date de fin est repoussée d’autant au dégel.»
  - «Nombre de jours» (1–180, default 14) and «Motif» («Voyage, blessure, examens…»).
- **Paiements tab:**
  - «Total encaissé : 1 290,000 DT» and «Encaisser un paiement».
  - Table: Date, Objet (the plan or «Paiement libre»), Moyen, Référence, «Encaissé par», Montant.
  - Modal: Montant (DT), Moyen, «Abonnement concerné», Référence, «Date du paiement» («Laisser vide pour maintenant»).
- **Accès tab:**
  - Card «Badge RFID» — «Numéro imprimé sur le badge ou lu par le terminal ZKTeco.», with «Numéro de badge» («Ex. 0012345678») and «Enregistrer le badge».
  - Registered state: the current number is prefilled. Clearing it and saving removes the badge (toast «Badge retiré.»).
  - Stats: «Visites ce mois», «Visites au total», «Dernière visite» («Jamais venu» when there is none).
  - Table «Dernières entrées»: Date, Porte, Moyen, Résultat.
- **Profil tab:** the profile fields. E-mail is disabled («Modifiable par le membre depuis l’application»). Button «Enregistrer le profil».
- **Suivi physique tab:**
  - «Nouvelle mesure».
  - The chart «Évolution du poids» («Dernière mesure : 78,5 kg le 17 nov. 2026») with its table twin: Date, Poids, Masse grasse, Tour de taille, IMC.
  - Modal fields: Date, Poids, Taille, Masse grasse, Masse musculaire, the five circumferences (Tour de taille, poitrine, hanches, bras, cuisse), Notes.
- **States:**
  - Page loading; «Membre introuvable.»
  - Variants: active, no subscription, frozen, expired, renewal queued, suspended.
  - Empty tables:
    - «Aucun abonnement» — «Utilisez « Renouveler » pour souscrire une offre.»
    - «Aucun paiement enregistré»
    - «Aucune entrée enregistrée»
  - Confirm dialogs:
    - Cancel: «L’accès aux portes s’arrête immédiatement.»
    - Suspend: «Ses accès aux portes et à l’application sont bloqués jusqu’à réactivation.»
    - Delete: «Le compte, les abonnements et l’historique de paiements seront supprimés. Cette action est irréversible.»
  - Toasts:
    - «Abonnement Trimestriel enregistré jusqu’au 12 mars 2027.»
    - «Badge enregistré : il sera envoyé au terminal de la porte.»
    - «Abonnement réactivé, la date de fin a été repoussée.»

**ADM-06 Prospects (CRM).**
- **Header:** «Prospects» — «Demandes d’essai du site, passages à l’accueil et contacts Instagram, jusqu’à l’inscription.», with «Nouveau prospect».
- **Filters:**
  - Search «Nom, téléphone, e-mail».
  - Source: «Toutes les sources» «Passage en salle» «Instagram» «Facebook» «Site web» «Parrainage» «Téléphone» «Autre».
  - A bell toggle «Relances dues (4)».
- **Board:**
  - Five columns with counts: «Nouveau» 6, «Contacté» 4, «Essai prévu» 3, «Inscrit» 9, «Perdu» 2.
  - Card: the name, «Instagram, Trimestriel», and the badges «Relance due» (danger) or «Essai le 21 nov.» (warning).
  - No drag-and-drop: the stage is set in the drawer.
- **Lead drawer (from the end edge):**
  - Header: «Salma Ayari» and «Instagram, arrivé il y a 2 jours».
  - Stage pills, with the current stage filled.
  - Details: Téléphone (tap to call), E-mail, Offre envisagée, Séance d’essai, Relancer le (red when due), Suivi par, Notes.
  - «Historique des échanges»:
    - A composer with the type chips «Appel» «Message» «E-mail» «Visite» «Note», a textarea «Ce qui a été dit, la prochaine étape…», and «Ajouter à l’historique».
    - A vertical timeline.
  - Footer: «Modifier», and «Inscrire comme membre» or «Voir la fiche membre».
- **Convert modal: «Inscrire Salma Ayari»** — «Crée le compte membre et passe le prospect en « Inscrit ».»
  - Offre, «Encaisser le paiement maintenant», Moyen, and «Mot de passe de l’application» («Vide : un mot de passe provisoire est généré.»).
  - Then the one-time «Mot de passe provisoire».
- **Lead form:** Prénom, Nom, Téléphone, E-mail, Source, Offre envisagée, Séance d’essai, Relancer le, Suivi par, Notes.
- **States:**
  - Column skeletons; «Aucun prospect» in an empty column.
  - Empty board: «Les demandes d’essai envoyées depuis le site arrivent ici automatiquement.»
  - Follow-up due.
  - Conversion blocked: «Ajoutez d’abord l’e-mail du prospect : il sert d’identifiant pour l’application.»

**ADM-07 Planning des cours (the coach's home page).**
- **Header:** «Planning des cours» — «Cours collectifs, réservations, liste d’attente et présences.», with «Nouveau cours».
- **Week navigation:** previous and next, «Semaine du 16 novembre au 22 novembre», and «Cette semaine».
- **Week grid:**
  - 7 day columns (min 980 px), with today ringed in red.
  - Session cards with a 3 px colour stripe: «18:00 – 19:00», «Cross-training», «Ahmed Kchaou», and either «Complet» (warning) with «, 3 en attente», or «12 places sur 16».
- **Class form: «Nouveau cours» / «Modifier le cours»**
  - Cours, Coach, Début, Fin, Salle.
  - «Couleur dans le planning»: 6 named swatches.
  - Places (1–200, default 20).
  - «Capacité liste d’attente» (default 10; «0 désactive la liste d’attente»).
  - «Places numérotées» («Chaque membre choisit son vélo ou son poste (1 à la capacité) en réservant.»).
  - «Répéter chaque semaine pendant (semaines)» (0–12; «0 = séance unique»).
  - Description.
- **◆ Bookings drawer for Cycling (from the end edge):**
  - «jeudi 19 novembre, 19:00 – 19:45, avec Leila Mzoughi, Studio vélo».
  - Stat boxes: «Places restantes 4 / 16», «Liste d’attente 0 / 10», «Annulation gratuite jusqu’à 17:00».
  - «Plan des places»: numbered squares, 8 per row. Blue means booked, green means present and an outline means free. Add a legend.
  - Grouped lists with counts: «Réservés», «Présents», «Liste d’attente» («n° 1»), «Absents et annulations tardives».
  - Each row: a spot chip, the name, «pointé à 18:32», a status badge, and the buttons «Présent» and «Absent». «Absent» only appears after the class starts.
  - Footer: «Supprimer» (not for coaches) and «Modifier».
- **States:**
  - Day skeletons; «Aucun cours» on an empty day.
  - Empty week: «Aucun cours cette semaine» — «Créez un cours et répétez-le sur plusieurs semaines en une fois.»
  - Full class; waiting list; numbered vs free seating; past class.
  - Validation: «La fin du cours doit être après le début.»
  - Delete confirm: «12 réservations seront annulées.»
  - Toast: «8 séances créées.»
  - The coach view, without delete.

**ADM-08 Entraînement: Programmes and program builder.**
- **Header:** «Entraînement» — «Programmes, bibliothèque d’exercices, suivi physique et coaching privé.», with the tabs «Programmes» «Exercices» «Mensurations» «Coaching privé».
- **Programs card:** «Programmes d’entraînement» — «Les membres retrouvent leur programme dans l’application.», with the tabs «En cours» «Tous» and «Nouveau programme».
- **Table:**
  - Programme (with the goal), Membre, Coach, Période «3 nov. 2026 → 29 déc. 2026», Séances.
  - Statut: «En cours» (success) or «Archivé» (neutral). The badge works as a toggle.
- **Builder (896 px modal):**
  - A member picker with the search «Nom, téléphone ou code membre», and a selected chip with ×.
  - Coach, Titre («Prise de masse, 4 jours»), Objectif, Début, «Durée (semaines)».
  - One panel per session, with an editable name «Jour 1» and duplicate and delete icons.
  - An exercise table: Exercice (autocomplete), Séries, Répétitions («8-12»), Charge (kg), Repos (s), and up, down and remove icons.
  - «Ajouter un exercice», «Ajouter une séance» and «Enregistrer le programme».
- **States:**
  - Empty: «Aucun programme» — «Créez un programme par jours et exercices pour un membre.»
  - Validation: «Choisissez le membre.» and «Donnez un titre au programme.»
  - When a coach creates a program, they are pre-selected as the coach.

**ADM-09 Exercices.**
- **Card:** «Bibliothèque d’exercices», with the filter «Tous les groupes» (Pectoraux, Dos, Épaules, Bras, Jambes, Fessiers, Gainage, Cardio, Full body) and «Nouvel exercice».
- **Table:** Exercice, Groupe musculaire, Matériel, Vidéo («Voir»), edit and delete.
- **Form:** Exercice («Squat barre»), Groupe, Matériel, «Vidéo de démonstration (URL)», Consignes.
- **Empty:** «Aucun exercice».

**ADM-10 Mensurations.**
- **Content:**
  - A member picker, then «Nouvelle mesure».
  - The chart «Évolution du poids» («Dernière mesure : …» or «Aucune pesée enregistrée»), with its table twin.
  - The same measurement modal as ADM-05.
- **Empty:** «Choisissez un membre» — «Son évolution (poids, masse grasse, tours) s’affiche ici.»

**ADM-11 Coaching privé.**
- **Card:** «Coaching privé» — «Séances individuelles : elles alimentent les commissions des coachs dans la paie.», with «Planifier une séance».
- **Table:**
  - It covers 7 days ago to 5 weeks ahead: Quand, Membre, Coach, Prix «45,000 DT», Statut («Prévue», «Faite», «Annulée», «Absent»).
  - Scheduled rows have «Faite», «Absent» and «Annuler».
- **Modal: «Planifier une séance de coaching»:** a member picker, Coach, Début, «Durée (minutes)» 60, «Prix (DT)», Notes, and «Planifier».
- **States:**
  - Empty: «Aucune séance de coaching».
  - Toast: «Séance de coaching planifiée.»
  - A coach sees only their own sessions.

**ADM-12 Portes et accès.**
- **Header:** «Portes et accès» — «Ouverture des portes, journal des passages et agents installés à la salle.», with the tabs «Portes» «Journal» «Agents». Agents is Admin only.
- **Portes tab:**
  - Each door card shows:
    - the name and location
    - a status dot: «En ligne» or «Hors ligne»
    - the driver («Terminal ZKTeco», «Relais HTTP» or «Simulateur»), «via PC-Accueil», and a «Désactivée» badge
    - a full-width «Ouvrir 5 s»
    - Admin edit and delete
  - «Nouvelle porte».
- **Door form:**
  - «Nom de la porte», Emplacement, Matériel.
  - «Agent de porte (PC de la salle)» («Obligatoire pour un terminal ZKTeco sur le réseau local.»).
  - «Durée d’ouverture (secondes)», 1–30.
  - ZKTeco only: «Adresse IP du terminal» (192.168.1.201) and Port (4370).
  - HTTP relay only: «URL du relais» (http://192.168.1.50/rpc/Switch.Set?id=0&on=true) and «Méthode HTTP».
  - «Porte active».
  - Show the field groups for each driver.
- **◆ Journal tab:**
  - «Journal des accès», with «Mise à jour en direct» or «Connexion au direct…».
  - Filters: «Toutes les portes», and «Tous» «Autorisés» «Refusés».
  - Table:
    - Quand: relative, with the full date on hover.
    - Qui: a member, or «Hela Gharsallah (équipe)».
    - Porte and Moyen.
    - Résultat: «Autorisé» (success), or the denial reason itself as a danger badge (reasons as in ADM-03).
  - «Afficher plus». New rows flash in.
- **Agents tab:**
  - An info card «Comment ça marche»: the agent runs on a PC or a Raspberry Pi on the gym network, next to the ZKTeco terminal or relay, and opens the door when access is granted.
  - «Nouvel agent».
  - Table: Agent, État («Connecté» or «Déconnecté»), Dernier signal, Portes, delete.
  - Key modal «Clé de l’agent»:
    - «Clé de PC-Accueil, affichée une seule fois.», with the key in monospace and a copy button.
    - «Dans door-agent/.env sur le PC de la salle : AGENT_KEY=…, puis redémarrez l’agent.»
    - «J’ai copié la clé».
- **States:**
  - Doors refresh every 15 s. An inactive door disables «Ouvrir». Opening shows a spinner.
  - Toasts: «Entrée principale ouverte.» and «La porte n’a pas répondu.»
  - «Aucune porte configurée» — «Ajoutez la porte d’entrée, puis reliez-la à l’agent installé sur le PC de la salle.»
  - «Aucun agent» — «Créez un agent puis collez sa clé dans le fichier .env du door-agent.»
  - Agent delete confirm: «Sa clé ne fonctionnera plus et ses portes ne s’ouvriront plus automatiquement.»
  - The Accueil view, without Agents.

**ADM-13 ★ Scanner QR.** The reception tablet kiosk. Design it at 1024 landscape and at 1440.
- **Header:** «Scanner QR» — «Posez la tablette à l’entrée : le membre présente le QR code de son application, la porte s’ouvre si l’abonnement est valide.», with «Plein écran».
- **Layout:**
  - Start side (the larger one): a square black camera viewport with a scan box.
  - End side:
    - Card «Porte à ouvrir»: a select, remembered on the device.
    - Card «Lecteur USB ou saisie manuelle»: an input with the placeholder «MLR1.MEL-00042…», «Vérifier», and the hint «Un lecteur USB tape le code puis « Entrée » : laissez ce champ sélectionné.»
- **Result overlay (4.5 s):**
  - Granted: solid #0A7A0A, a 96 px check, display «Bienvenue», «Amira Jaziri», and «Abonnement valable jusqu’au 12 décembre 2026».
  - Denied: solid #B3261E, an X, «Accès refusé», and the reason. Draw these reasons:
    - Nour Mejri: «Abonnement expiré le 31/10/2026. Merci de le renouveler.»
    - Oussama Hammami: «Compte suspendu. Merci de passer à l’accueil.»
    - «QR code expiré. Actualisez le code dans l’application.»
    - «QR code déjà utilisé. Attendez le prochain code.»
    - «QR code invalide.»
    - «Membre inconnu.»
    - «Porte non gérée par cet agent.»
- **States:**
  - Scanning; granted; denied (with vibration).
  - «Caméra indisponible» — «Autorisez l’accès à la caméra dans le navigateur, ou utilisez un lecteur QR USB avec le champ ci-contre.»
  - «Aucune porte configurée» — «Ajoutez une porte dans « Portes et accès » avant d’utiliser le scanner.»
  - The same code is ignored for 4 s.
  - The full-screen kiosk, without the shell, readable from 1.5 m.

**ADM-14 Tâches (Kanban).**
- **Header:** «Tâches» — «Les tâches des workflows et les tâches ponctuelles, de « Bloquée » à « Terminée ».», with «Nouvelle tâche» and the toggles «Mes tâches» and «En retard».
- **Columns:** «Bloquée» 2, «À faire» 7 (failed tasks included), «En cours» 3, «Terminée» (the latest 20).
- **Card:**
  - A title, such as «Préparer le badge RFID de Skander Gharbi».
  - The run link «Onboarding Skander Gharbi».
  - The assignee and role, or «Toute l’équipe».
  - «Attend : Créer le compte membre».
  - Badges: «En échec» and «En retard» (red ring), «Échéance dans 2 heures», «Terminée il y a 1 heure, Hela Gharsallah».
  - Buttons by status: «Commencer», «Terminer», «Ignorer», «Rouvrir», «Relancer».
  - Delete (Admin only, one-off tasks only).
- **Create modal:**
  - Titre («Vérifier l’extincteur du plateau»), Description, Rôle assigné, Personne assignée, Échéance.
  - A «Dépend de» checklist, with «La tâche reste « Bloquée » tant que ces tâches ne sont pas terminées.»
- **States:**
  - Skeleton; «Rien ici» in an empty column; «Aucune tâche ouverte à lier.»
  - Overdue tasks sort first. The board refreshes every 30 s. No drag-and-drop.

**ADM-15 Workflows: Modèles and Exécutions.**
- **Header:** «Workflows» — «Des tâches liées entre elles, démarrées à la main, par un événement ou selon un horaire.», with «Nouveau workflow» (Admin) and the tabs «Modèles» «Exécutions».
- **Modèles tab** (a grid of 1, 2 or 3 columns). Each card shows:
  - the name, an «Actif» or «Inactif» badge, and a 2-line description
  - the trigger line, one of:
    - a lightning icon with an event: «Nouveau membre inscrit», «Abonnement souscrit», «Abonnement bientôt expiré», «Abonnement expiré», «Paiement reçu», «Réservation de cours», «Nouveau prospect», «Vente en boutique», «Stock bas», «Panne signalée»
    - a clock icon with a schedule («Du lundi au samedi à 5h45»)
    - a play icon with «Démarrage manuel»
  - «5 tâches, 38 exécutions»
  - the buttons «Démarrer», and «Modifier» (Admin) or «Voir», plus delete
- **Exécutions tab:**
  - Tabs «En cours» «Terminées» «Annulées» «Toutes».
  - Table: Exécution, Démarrée, Avancement (a bar and «3/5»), Statut.
- **States:**
  - Skeleton cards.
  - «Aucun workflow» — «Enchaînez des tâches liées : accueil d’un nouveau membre, ouverture de la salle, relance des abonnements expirés…», with «Créer un workflow».
  - «Aucune exécution».
  - Delete confirm: «Les exécutions passées sont conservées.»

**ADM-16 ◆ Workflow visual editor.**
- **Top bar:** back «Workflows», the title, «Ajouter une tâche», «Organiser», «Démarrer» (saved workflows only) and the primary «Enregistrer».
- **Canvas:**
  - It stays left to right in Arabic and follows the dark or light theme.
  - A dotted grid, a minimap and zoom controls.
  - **Task nodes (230×96):**
    - a hand icon (manual) or a robot icon (automatic)
    - a 2-line title, and the meta line «Manuelle, Accueil, 24 h»
    - a grey input handle on the left and a red output handle on the right
    - the selected node is outlined in red
  - Arrows mean "depends on".
- **Sample graph («Accueil d’un nouveau membre»):**
  1. «Créer le compte membre»
  2. «Préparer le badge RFID» and «Message de bienvenue (n8n)» (automatic), both depending on step 1
  3. «Séance découverte avec un coach»
  4. «Appel de suivi J+7»
- **Inspector (360 px):**
  - **Nothing selected: «Workflow».**
    - Nom and Description.
    - «Titre des exécutions» («Onboarding {{firstName}} {{lastName}}»), with the hint «Les {{variables}} viennent de l’événement déclencheur.»
    - Déclencheur: «Manuel», «Événement» or «Planifié».
    - Événement.
    - Schedule presets: «Chaque jour à 5h45», «Chaque jour à 8h00», «Chaque soir à 22h00», «Du lundi au samedi à 5h45», «Chaque lundi à 9h00», «Le 1er du mois à 9h00», and «Expression cron personnalisée» with the cron field «45 5 * * 1-6».
    - «Workflow actif» («Inactif : il ne démarre plus automatiquement.»).
    - A help box: «Glissez du point rouge d’une tâche vers une autre pour créer une dépendance…»
  - **Task selected: «Tâche».**
    - Titre, Description, and Type («Manuelle» or «Automatique»).
    - Automatic: «URL du webhook (n8n…)» and Méthode.
    - Manual: «Rôle assigné» («Toute l’équipe», «Administrateur», «Accueil», «Coach») and «Personne assignée».
    - «Délai (heures)» («Compté à partir du moment où la tâche devient « À faire ».»).
    - «Dépend de : …».
    - The danger button «Supprimer la tâche».
  - **Link selected: «Lien de dépendance».** «« B » commence quand « A » est terminée.» and «Supprimer ce lien».
- **Start modal:** «Démarrer le workflow», with an optional «Titre de l’exécution».
- **States:**
  - Loading; not found.
  - Validation: «Donnez un nom au workflow.», «Ajoutez au moins une tâche.», «Chaque tâche doit avoir un titre.», a missing webhook URL, and a missing event or schedule.
  - A refused cycle (toast): «Ce lien créerait une boucle : une tâche ne peut pas dépendre d’elle-même.»
  - Dragging a new link.
  - Read-only for Accueil.
  - Dark and light canvas.

**ADM-17 ◆ Workflow run detail.**
- **Header:**
  - Back «Workflows», then «Onboarding Skander Gharbi».
  - Meta: «Accueil d’un nouveau membre, démarré le 19 nov. 2026 à 10:12, Hela Gharsallah».
  - A status badge, the progress «3/5», and the danger button «Annuler l’exécution».
- **Read-only graph (420 px):**
  - Each node is ringed and labelled by status: Bloquée grey, À faire blue, En cours amber, Terminée green, Ignorée grey, En échec red.
  - «, en retard» appears in red when a task is late.
  - The edges that leave in-progress tasks are animated.
- **«Tâches» card:**
  - Each row shows the title, the assignee or role, «échéance 20 nov., 10:12», the automation output, and badges.
  - Manual tasks have their action buttons; failed automations have «Relancer».
- **States:**
  - Loading; «Exécution introuvable.»
  - Running, completed, and cancelled (no actions).
  - The page refreshes every 15 s.
  - Cancel confirm: «Les tâches restantes ne seront plus proposées.»

**ADM-18 Boutique: Caisse (point of sale).** Touch-first, at 1024 and 1440.
- **Header:** «Boutique» — «Caisse, produits, stock et historique des ventes.», with the tabs «Caisse» «Produits» «Stock» «Ventes».
- **Start side (products):**
  - The search «Produit ou code-barres», and the categories «Tout» «Compléments» «Boissons» «Snacks» «Textile» «Accessoires» «Services».
  - Product tiles (2, 3 or 4 columns):
    - a 4:3 image area, showing the product photo (`imageUrl`, cover) or the bag placeholder on `surface-3`
    - the name and price
    - «24 en stock» (amber when low), or «Épuisé» (disabled)
    - a red ring and a red quantity bubble when the product is in the cart
- **End side (a sticky 380 px cart):**
  - «Panier», with «Articles : 5» (the count of units) or «Touchez un produit pour l’ajouter».
  - Lines with − qty +.
  - «Membre (facultatif, pour le ticket par e-mail)», shown as the chip «Membre : Amira Jaziri» with «Retirer».
  - «Remise (DT)».
  - A 2×2 payment grid.
  - Sous-total, Remise and Total.
  - The large button «Encaisser 31,500 DT».
  - Sample cart: 2 × Eau minérale, 1 × Barre protéinée, 1 × Shaker, 1 × Boisson isotonique.
- **Receipt modal: «Ticket de caisse»** (an 80 mm print layout)
  - The logo, «Meliora Gym» and «Khzema Est, Rue Colonel Garnaoui, Sousse».
  - «Ticket V-2026-000412, 19 nov., 18:47».
  - Lines such as «2 × Eau minérale 3,000 DT», then Remise and Total.
  - The payment method and the seller; «Vente remboursée» when refunded.
  - Buttons «Fermer» and «Imprimer».
  - Also draw the printed black-and-white version.
- **States:**
  - Empty cart (checkout disabled).
  - Checking out; the toast «Vente V-2026-000412 encaissée : 31,500 DT.»
  - Out-of-stock tiles.
  - «Aucun produit» — «Ajoutez vos produits dans l’onglet Produits.»
  - Error toast.

**ADM-19 Boutique: Produits and Stock.**
- **«Produits» card:**
  - The «Stocks bas» toggle, «Mouvement de stock» and «Nouveau produit».
  - Table:
    - Produit (with a thumbnail and the SKU), Catégorie, Prix, Marge, Statut.
    - Stock: a number, «Service», or the amber badge «3 : stock bas».
    - Actions.
- **Product form:**
  - «Prix de vente (DT)»; «Coût d’achat (DT)» («Sert au calcul de la marge.»); «Référence / code-barres»; «Alerte stock bas sous».
  - «Stock initial» (new products only); «Photo (URL)»; «En vente».
- **Movement form:**
  - Produit («Whey protéine 1 kg (stock 12)»).
  - Mouvement: «Entrée (livraison)», «Sortie (casse, usage interne)» or «Inventaire (stock compté)».
  - Quantité («Pour un inventaire : le stock réellement compté.»).
  - «Coût unitaire (DT)» (entries only) and Motif.
- **«Mouvements de stock» — «Livraisons, ventes, retours et inventaires.»:** a table with Date, Produit, Type, Quantité (+ in green, − in red), Motif, Par.
- **States:**
  - «Aucun produit», «Aucun stock bas», «Aucun mouvement».
  - Delete confirm: «Un produit déjà vendu est simplement retiré de la vente.»

**ADM-20 Boutique: Ventes.**
- **Card:** «Ventes» — «42 ventes, 1 286,500 DT», with the dates Du and Au (the last 7 days by default).
- **Table (a row opens the receipt):**
  - Ticket, Date, Articles («2× Eau, 1× Barre protéinée»), Paiement, Statut («Payée» or «Remboursée»), Total.
  - A refund icon (Admin).
  - Pagination of 25.
- **States:**
  - Empty: «Aucune vente sur cette période».
  - Refund confirm: «Rembourser la vente V-2026-000412 ?» — «31,500 DT ; les articles reviennent en stock.»

**ADM-21 Salles et équipements: Équipements.**
- **Header:** «Salles et équipements» — «Parc machines, entretiens préventifs, pannes et casiers.», with the tabs «Équipements» «Pannes» «Casiers» «Salles».
- **Filters:** «Toutes les salles», the toggle «Entretiens dus», and «Ajouter».
- **Table:**
  - Équipement, Salle.
  - État: «En service», «En maintenance», «En panne», «Retiré».
  - Prochain entretien: a date, «Dans 3 j» (amber) or «En retard de 5 j» (red).
  - Actions: a wrench («Signaler une panne»), edit, delete.
- **Equipment form:**
  - Équipement («Tapis de course 3»).
  - Catégorie: «Cardio», «Machine guidée», «Poids libres», «Accessoire», «Autre».
  - Salle, État, Marque, Modèle, N° de série.
  - Date d’achat, Prix d’achat (DT), Garantie jusqu’au.
  - «Entretien tous les (jours)», Dernier entretien, Notes.
- **Fault modal: «Signaler une panne : Tapis de course 3»**
  - Problème («La courroie patine»), Priorité, «Confié à», Détails.
  - Button «Ouvrir le ticket».
- **Empty states:** «Aucun équipement» and «Aucun entretien à prévoir cette semaine».

**ADM-22 Pannes.**
- **Card:** «Pannes et maintenance», with the tabs «Tous» «Ouverts» «En cours» «Résolus» and «Signaler».
- **Table:**
  - Problème, Priorité, Ouvert le, Confié à, Statut («Ouvert» warning, «En cours» info, «Résolu» success).
  - Actions «Prendre en charge» and «Résoudre». Resolved rows show the cost.
- **Resolve modal: «Clore le ticket»** — «Un coût saisi est enregistré automatiquement dans les dépenses (maintenance).»
  - «Intervention réalisée»* and «Coût (DT)», then «Marquer comme résolu».
- **Empty:** «Aucun ticket» — «Rien à réparer pour l’instant.»

**ADM-23 Casiers.**
- **Card:** «Casiers», with the filter «Tous les vestiaires» and «Créer des casiers». The description counts follow the filter:
  - «29 libres, 47 occupés, 4 hors service» for all 80 lockers
  - «12 libres, 26 occupés, 2 hors service» for Vestiaire femmes
- **Grid:**
  - 4, 8 or 12 columns of tall 3:4 tiles.
  - Each tile shows the number («F-12») and a sub-label:
    - «Libre»: outline only
    - a first name: info tint
    - «Échu»: warning
    - «Hors service»: neutral, struck through
- **Locker modal: «Casier F-12»**
  - «Attribué à Amira Jaziri».
  - «Attribuer jusqu’au», and a member search («Nom, téléphone ou code»).
  - «Libérer le casier», and «Mettre hors service» or «Remettre en service».
- **Range modal:** Vestiaire, Préfixe, «Du numéro», «Au numéro».
- **States:**
  - Empty: «Aucun casier» — «Créez une rangée de casiers numérotés en une fois (par exemple H-1 à H-40).»
  - Toasts: «Casier F-12 attribué.» and «40 casiers créés.»

**ADM-24 Salles.**
- **Card:** «Salles» — «Les salles ouvertes sont présentées sur le site.», with «Nouvelle salle».
- **Table:** Salle (type, floor), Capacité, Équipements, Statut («Ouverte» or «Fermée»).
- **Form:**
  - Nom.
  - Type: «Musculation», «Cardio», «Cours collectifs», «Cross training», «Vestiaire», «Accueil», «Autre».
  - «Capacité (personnes)», Étage, «Description (affichée sur le site)», Ouverte.
- **Empty:** «Aucune salle».

**ADM-25 Employés.**
- **Header:** «Employés» — «Contrats, pointage, congés et paie de l’équipe.», with a link to «Calendrier de l’équipe» and the tabs «Employés» «Pointage» «Congés» «Paie». Paie is Admin only.
- **Table:**
  - Employé (a colour square, the name and contact), Poste.
  - Contrat («CDI depuis le 1 janv. 2025»).
  - Rémunération: «1 100,000 DT / mois», «15,000 DT / h» or «35,000 DT / séance».
  - Statut: «Actif» or «Parti».
- **Form (896 px, 2 columns):**
  - Identity: Prénom, Nom, Poste.
  - Contract: Contrat («CDI», «CDD», «Freelance», «Stage»), Date d’embauche, Fin de contrat.
  - Pay: Rémunération («Mensuel», «À l’heure», «À la séance»), Montant (DT), «Commission coaching privé (0 à 1)».
  - Contact and IDs: Téléphone, E-mail, N° CIN, N° CNSS, RIB.
  - Other: «Compte back-office lié», Statut, Notes.
- **States:**
  - Empty: «Aucun employé» — «Ajoutez l’équipe d’accueil, les coachs et l’entretien.»
  - Delete confirm: «Préférez le statut « Parti » pour garder l’historique de paie.»

**ADM-26 Pointage (time-clock kiosk).** Design it as the HR tab at 1440, and as a full-screen kiosk at 1024. The full-screen route is planned but not built yet.
- **Helper text:** «Chaque employé touche son nom en arrivant et en partant. Les retards sont calculés d’après le planning.»
- **Tiles:**
  - Large tap tiles: a 44 px icon in the position colour, the name, and «Accueil, toucher pour arriver» or «Présent depuis 13:56, toucher pour partir».
  - Tiles of people who are present have a green tint.
- **Table «Pointages du jour»:** Employé, Arrivée, Départ (or the badge «Présent»), Retard (amber «12 min»), Durée («6 h 05»).
- **States:**
  - A busy tile.
  - Toasts: «Arrivée de Fatma Riahi à 16:12, 12 min de retard.» and «Départ de Rim Zouari enregistré.»
  - Empty: «Personne n’a encore pointé aujourd’hui».
  - The page refreshes every 30 s.

**ADM-27 Congés.**
- **Card:** «Congés et absences», with the tabs «À valider» «Acceptés» «Refusés» «Tous» and «Demande de congé».
- **Table:**
  - Employé.
  - Type: «Congé annuel», «Maladie», «Sans solde», «Autre».
  - Période «23 nov. 2026 → 27 nov. 2026 (5 j)», Motif, Statut.
  - The Admin actions «Accepter» and «Refuser», or the name of whoever decided.
- **States:**
  - Empty: «Aucune demande à valider» and «Aucun congé».
  - Validation: «La date de fin doit être après la date de début.»
  - Toasts: «Congé accepté.» and «Congé refusé.»

**ADM-28 Paie (Admin).**
- **Card:** «Paie» — «Total net du mois : 9 850,000 DT».
- **Controls:** a month picker that defaults to last month, «Générer la paie du mois» and «Recalculer».
- **Table:**
  - Employé, Base, Activité («168 h, 18 séances»), «Commissions et primes», Retenues («−50,000 DT»), and Net in bold.
  - Statut: «Brouillon» or «Payé le 3 nov.».
  - Draft rows have a pencil and «Marquer payé».
- **Adjust modal:** «Ajuster la paie de Ahmed Kchaou», with Commissions, Primes, Retenues («Avances, absences non payées…») and Notes.
- **Pay modal:** «Payer Ahmed Kchaou : 1 674,000 DT» — «Le salaire est aussi enregistré dans les dépenses du mois.», with Moyen de paiement (Virement by default).
- **States:**
  - Empty: «Pas encore de paie pour octobre 2026» — «Générez les fiches : elles restent modifiables tant qu’elles ne sont pas payées.»
  - Recalculate confirm: «Les fiches en brouillon sont recalculées ; les fiches payées ne changent pas.»

**ADM-29 ◆ Calendrier de l’équipe.**
- **Header:** «Calendrier de l’équipe» — «Qui travaille quand, et les heures pointées face aux heures prévues.», with «Nouveau créneau».
- **Toolbar:**
  - The segmented control «Semaine» «Jour».
  - Previous and next arrows, which flip in RTL.
  - The range «Du 16 nov. au 22 nov.» or «Jeudi 19 novembre», and «Aujourd’hui».
  - The filters «Tous les postes» and «Toutes les salles».
- **Week view:**
  - A colour legend.
  - One row per employee (a colour square, the name and position), with 7 day columns. Today's column is tinted.
  - Shift chips: «14:00–22:00» with the task, styled as in the §2.3 contrast rules. «+» appears on hover.
  - A last column «Prévu / pointé»:
    - «Prévu» adds up every shift in the visible week, and «… pointées» turns red when clocked hours fall more than 30 min below plan.
    - Show the past week (9–15 Nov): Hela «40 h» / «39,7 h pointées» (not red) and Moez «16 h» / «12 h pointées» (red).
    - In the current week, most rows turn red mid-week (see Proposals).
- **Day view:**
  - A Gantt card «Journée» — «Cliquez sur une ligne vide pour ajouter un créneau».
  - Hour ticks from 6h to 22h, and labelled shift bars in position colours.
  - A thin neutral bar under each row for «Présence pointée».
  - A current-time line with an «18:45» chip, and a table twin.
- **Shift modal: «Nouveau créneau» / «Modifier le créneau»**
  - Employé, Jour, Début, Fin.
  - Tâche («Accueil, ménage, cours…»), Salle («Plateau, studio…»).
  - «Répéter chaque semaine pendant (semaines)».
  - Buttons «Supprimer», «Annuler», «Enregistrer».
- **States:**
  - «Aucun employé actif» — «Ajoutez les employés dans « Employés » pour planifier leurs créneaux.»
  - «Personne n’est planifié ce jour-là.»
  - Validation: «L’heure de fin doit être après l’heure de début.»
  - RTL: the week grid mirrors, but the hour axis stays left to right.
  - Light theme, with the light position colours.

**ADM-30 ◆ Performance (Admin).**
- **Header:** «Performance» — «GMV, NMV, marges et revenus récurrents, abonnements et boutique réunis.»
- **Period picker:** «Ce mois» «Mois dernier» «3 mois» «12 mois» «Personnalisé» (with Du and Au), and the range «Du 1 nov. 2026 au 19 nov. 2026».
- **Seven KPIs (one strip), each with its note:**
  - GMV: «Volume brut : abonnements au prix catalogue et ventes avant remises».
  - NMV: «Après 1 120 DT de remises, 240 DT de remboursements et 270 DT d’annulations».
  - Marge brute: «95 % du NMV, après coût des marchandises».
  - Marge opérationnelle: «28 % du NMV, après toutes les dépenses».
  - Encaissé: «Paiements reçus et ventes encaissées».
  - MRR: «Abonnements actifs ramenés à 30 jours».
  - ARPU: «NMV abonnements par membre actif (412 membres)».
- **Charts:**
  - «GMV, NMV et dépenses» — «Par mois, en dinars»: grouped bars. The table twin adds Résultat.
  - «Marge opérationnelle» — «Résultat / NMV, par mois»: a percentage line.
- **Table «Abonnements et boutique» — «D’où vient le chiffre d’affaires sur la période»:**
  - Rows: Volume brut, Remises, Annulations / remboursements, Net (NMV), Coût des marchandises, Marge brute.
  - Columns: Abonnements, Boutique, Total.
  - The net and margin rows are bold. Cells that don't apply show «—».
- **States:**
  - Skeleton; KPIs dimmed while refetching; error with retry.
  - «Données d’abonnements indisponibles pour le moment.» and «Données de la boutique indisponibles pour le moment.»

**ADM-31 Paiements.**
- **Header:** «Paiements» — «Tous les encaissements d’abonnements, filtrables par période et moyen de paiement.»
- **Filters:** Du and Au (month to date), and «Moyen» («Tous», «Espèces», «Carte bancaire», «Virement», «D17»).
- **Summary card:** on the end side, «128 paiements sur la période» with «21 480,000 DT».
- **Table:**
  - Date «19 nov., 09:14», Membre (link and code), Objet, Moyen, «Encaissé par», Montant.
  - Pagination of 25.
- **States:**
  - Loading and refetch.
  - Empty: «Aucun paiement sur cette période» — «Élargissez les dates ou retirez le filtre de moyen de paiement.»
  - Error.

**ADM-32 Dépenses et résultats (Admin).**
- **Header:** «Dépenses et résultats» — «Recettes des abonnements et de la boutique, dépenses et résultat mois par mois.», with the tabs «6 mois» «12 mois».
- **KPI strip:** «Abonnements ce mois», «Boutique ce mois», «Dépenses ce mois», «Résultat ce mois» (with the red badge «Perte» when negative).
- **Charts:**
  - «Recettes et dépenses»: paired bars, with a table twin of Mois, Abonnements, Boutique, Dépenses, Résultat.
  - «Résultat mensuel»: Bénéfice vs Perte, shown by label and sign, not by colour alone. Show August as a loss month.
  - «Dépenses par catégorie»: Loyer, Salaires, «Eau, électricité, internet», Maintenance, Équipement, Marketing, Fournitures, «Impôts et taxes», Autre.
- **«Dépenses» card:**
  - «Total sur la période : …», with Du and Au, «Toutes les catégories» and «Nouvelle dépense».
  - Table: Date, Libellé (with the supplier, or «Automatique»), Catégorie, Moyen, Montant.
  - Edit and delete apply to manual expenses only. Salaries and repair costs are recorded automatically.
- **Form:** Libellé («Loyer novembre»), Catégorie, Montant, Date, Moyen, Fournisseur, «Référence (facture…)».
- **Empty:** «Aucune dépense sur cette période».

**ADM-33 Codes promo (Admin).**
- **Header:** «Codes promo» — «Remises appliquées à la souscription d’un abonnement.», with «Nouveau code».
- **Table:**
  - Code (bold), Remise («10 %» or «15,000 DT»), Validité («1 sept. → 30 sept.» or «Sans limite»), Utilisations («37 / 50»).
  - État: «Actif» (success), «À venir» (info), «Épuisé» (warning), «Expiré» (neutral), «Désactivé» (neutral).
- **Form:**
  - Code (placeholder «RENTREE26»; «Lettres et chiffres, saisi par l’accueil à la vente.»).
  - «Type de remise», and Valeur («Pourcentage (0-100) ou montant en DT»).
  - «Utilisations max.» («Vide = illimité»).
  - «Valable du», «Valable jusqu’au», «Description interne», Actif.
- **Empty:** «Aucun code promo» — «Créez un code pour une campagne Instagram ou la rentrée.»

**ADM-34 Offres et tarifs.**
- **Header:** «Offres et tarifs» — «Les offres en vente apparaissent sur le site et dans l’application.», with «Nouvelle offre» (Admin).
- **Table:**
  - Offre (with an amber star for «Mise en avant»), Durée «90 jours», Avantages (hidden when narrow), Statut, Prix.
  - Accueil sees the rows read-only.
- **Form:**
  - «Nom de l’offre», «Durée (jours)», «Prix (DT)», «Ordre d’affichage», Description, «Avantages (un par ligne)».
  - «Mettre en avant sur le site».
  - «En vente» («Une offre retirée de la vente reste valable pour les abonnements en cours.»).
- **States:**
  - Empty: «Aucune offre» — «Créez l’offre mensuelle, trimestrielle et annuelle.»
  - Delete confirm: «Si elle a déjà été vendue, elle est simplement retirée de la vente.»

**ADM-35 Comptes équipe (Admin).**
- **Header:** «Comptes équipe» — «Qui peut se connecter au back-office, avec quel rôle. Les coachs apparaissent sur le site.», with «Nouveau compte».
- **Tabs:** «Tous» «Administrateurs» «Accueil» «Coachs».
- **Table:**
  - Nom (with the e-mail, and the coach photo when one is set), the Rôle badge, Spécialité, Depuis, Statut.
  - Edit and delete, except on your own account.
- **Form:**
  - Prénom, Nom, «E-mail de connexion», Téléphone, Rôle.
  - Mot de passe («8 caractères minimum.»). When editing, it becomes «Nouveau mot de passe» — «Laisser vide pour le conserver.»
  - Coach-only fields: «Spécialité (coachs)», «Photo (URL)» (with a preview in the photo slot), «Présentation affichée sur le site».
  - When editing: «Compte actif».
- **States:**
  - «Aucun compte».
  - Delete confirm: «La personne ne pourra plus se connecter.»
  - The coach fields appear when the role is Coach.

---

## 7. Public website (WEB): always dark

**WEB-00 Page.** One long page.
- **Section order:** header, Hero `#top`, Facts strip, About `#salle`, Spaces, Plans `#offres`, Schedule `#planning`, Coaches, App `#app`, Free trial `#essai`, Location `#acces`, Instagram band, Footer.
- **Background rhythm:** sections alternate black and steel-950, with corrugated bands for the facts strip and the trial section.
- **Data:** live from the API, with a fallback for every section.
- **Motion:** the hero entrance is the only entrance animation; sections don't reveal on scroll. With reduced motion there is no 3D and no entrance animation.

**WEB-01 Header and mobile menu.**
- **Bar:** 64 px (72 px from sm up).
  - The logo tile and «Meliora Gym» (title style).
  - Links: «La salle», «Offres», «Planning», «L’app», «Accès».
    - EN: The gym, Plans, Schedule, The app, Find us
    - AR: القاعة، الاشتراكات، البرنامج، التطبيق، العنوان
  - The language pills «FR» «EN» «ع».
  - The red CTA «Essai gratuit», and below lg a hamburger «Menu».
- **Mobile menu:**
  - A full-height black panel with large wide-type links, separated by hairlines.
  - A full-width red «Essai gratuit» and a small underlined «Espace équipe».
  - Page scroll is locked while the menu is open.
- **States:**
  - Transparent over the hero.
  - Scrolled more than 24 px: 90% black with a blur and a bottom hairline.
  - Menu open.

**WEB-02 ★ Hero: hexagon LED ceiling (Three.js).**
- **Scene:**
  - Full viewport height (100svh), black.
  - A WebGL honeycomb of thin cool-white LED tubes (an #E9F2FF core with a soft glow) inside a rectangular frame, seen from below and fading with depth.
  - The tubes flicker on like fluorescent lights, in a wave from the front, then hold steady. The camera then drifts gently towards the pointer.
  - Rendering pauses when the hero is off-screen.
- **Fallback** (before load, without WebGL, with reduced motion, or on a GPU error): `interior.jpg` at cover with blur(24px) and opacity 0.35, the hex pattern, and a cool radial glow at the top.
- **Content** (anchored bottom-start, over a black bottom scrim):
  - The 64–80 px logo tile with `led-glow`, and «Salle de sport à Khzema Est, Sousse» in the label style in steel-300 (not an uppercase kicker).
  - The H1, which slides up:
    - «Forge ta» / «meilleure version»: two lines from 768 up, three on phones («Forge ta» / «meilleure» / «version»).
    - EN «Forge your» / «best self»; AR «اصنع» / «أفضل نسخة منك».
  - The red rule, scaling in.
  - Lead: «Musculation, cardio, cours collectifs et coachs passionnés dans un espace pensé pour la performance. Ton abonnement et ton accès à la salle tiennent dans ton téléphone.»
  - 48 px CTAs: the red «Réserver ma séance d’essai» and the outlined white «Voir les offres».
- **Frames to deliver:**
  - 3 intro keyframes: dark, the wave halfway, steady.
  - Steady with content; the fallback; 375 px; Arabic.
  - An animated prototype, if you can build one.

**WEB-03 Facts strip.**
- **Layout:** a corrugated band with three cells, stacked on phones and as divided columns from md up.
- **Cells:**
  - Clock: «Ouvert aujourd’hui» with «06:00 – 22:00». On Sundays it shows the Sunday hours, and «—» if the hours are unknown.
  - Pin: «Khzema Est, Rue Colonel Garnaoui» with «Sousse 4051, Tunisie».
  - QR: «Accès QR code & application» with «Cours collectifs chaque semaine».
- **Colours:** `led` icons, steel-300 labels, white values.

**WEB-04 About (#salle).**
- **Start side:** `shield-sign.jpg` at 4:5 with radius 16, captioned «L’emblème Meliora, Rue Colonel Garnaoui.»
- **End side:**
  - «Plus fort chaque jour».
  - «Meliora, c’est le latin de « toujours mieux ». Notre emblème — l’athlète qui forge sa propre statue — résume notre philosophie : chacun sculpte sa meilleure version, séance après séance.»
  - «Équipements récents, éclairage hexagonal, ambiance industrielle et une équipe qui connaît ton prénom : tout est là pour que tu progresses.»
  - Three points with `led` dots: «Accès par QR code», «Ouverture de porte depuis l’app», «Suivi en temps réel».

**WEB-05 Spaces.**
- **Sticky start column:**
  - «Un plateau taillé pour l’effort».
  - `interior.jpg` at its natural 141×235 size, treated as a small captioned photo rather than a hero image.
  - The caption «Le plafond LED hexagonal de la salle principale.»
- **End column:** a hairline list of the open rooms. Each row shows the name, the type and floor, the description, and the capacity as a big number with «pers.».
- **Fallback (no rooms):**
  - Musculation: «Charges libres, machines guidées et racks pour tous les niveaux.»
  - Cardio: «Tapis, vélos et rameurs pour travailler endurance et récupération.»
  - Cours collectifs: «Cross training, HIIT, mobilité : l’énergie du groupe, l’œil du coach.»
  - Coaching: «Programmes personnalisés et suivi de progression avec nos coachs.»

**WEB-06 Plans (#offres).**
- **Header:** «Choisis ton rythme», with «Sans frais cachés. Paiement en espèces, carte, virement ou D17 à l’accueil.»
- **Grid:** hairline-separated plan cards in 1, 2 or 3 columns.
- **Card:**
  - The name and duration («1 mois», «3 mois», «1 an»).
  - The featured plan has «Le plus choisi» in `red-300`, a 4 px red top bar and a steel-900 background.
  - The price: «240» with a small «,000 DT».
  - The description, and features with `led` checks.
  - «Je commence»: red on the featured card, outlined on the others. It pre-fills the trial form and scrolls to it.
- **States:**
  - Loaded: the §3 sample prices.
  - Loading: 3 skeleton cards.
  - Fallback: Mensuel, Trimestriel and Annuel with «Tarif en salle» instead of a price, and «Tarifs à jour disponibles à l’accueil.»

**WEB-07 Schedule (#planning).**
- **Header:** «Les cours de la semaine», with «Réserve ta place depuis l’application Meliora.»
- **Grid:** 7 columns starting today (min 880 px; it scrolls sideways on phones). Day headers read «Jeudi 19», with today underlined in red.
- **Session card:**
  - steel-900, with a 3 px class-colour stripe.
  - «19:00 – 19:45», «Cycling», «avec Leila».
  - «4 places restantes», «1 place restante», «Complet» or «Complet, liste d’attente ouverte». The full states are in warning.
- **States:**
  - Loading placeholders.
  - Empty week: a dashed box with «Le planning de la semaine sera publié très bientôt.»
  - A day with no classes.
  - Arabic: Arabic day labels, with the first day on the right.

**WEB-08 Coaches.**
- **Header:** «Des coachs à tes côtés».
- **Grid:** 1, 2 or 3 columns. Each card has an 80 px avatar, the name, the specialty in steel-300, and a short bio.
  - The avatar is the coach photo slot (§2.7), or `led` initials on steel-800.
  - Ahmed Kchaou: Cross training, HIIT.
  - Leila Mzoughi: Cycling, mobilité.
  - Sami Haddad: Musculation, Body Pump.
- **Empty:** «Nos coachs t’accueillent en salle tous les jours.»

**WEB-09 App (#app).**
- **Header:** «Ta salle dans ta poche», with «Ton abonnement, tes cours et ton accès à la salle réunis dans une seule application.»
- **Four features (2×2):**
  - «QR code d’accès» — «Un code qui change toutes les 30 secondes : présente-le au lecteur, la porte s’ouvre.»
  - «Ouvrir la porte depuis l’app» — «Arrivé devant la salle ? Un bouton suffit, ta position confirme que tu es bien là.»
  - «Réservation des cours» — «Réserve ou annule ta place en un geste et reçois un rappel.»
  - «Abonnement & rappels» — «Jours restants, historique de paiements et rappel avant expiration.»
- **Store buttons:** white 48 px «App Store» and «Google Play», or the pill «Bientôt sur l’App Store et Google Play».
- **Phone mockup:**
  - A simplified mockup in the APP-15 style (not a full APP-15 screen), in a steel-800 frame.
  - It shows the logo tile, the green pill «23 jours restants», «Amira J.», «Trimestriel, jusqu’au 12 déc.», the QR code with «Valable 30 s», and the red «Ouvrir la porte depuis l’app».
  - **Change:** the code hard-codes «Yasmine B.», and `app.mockPlan` reads «Trimestriel, jusqu’au 28 janv.». Update both to this mock data.

**WEB-10 Free trial (#essai).**
- **Layout:** a corrugated background.
  - Start side: «Ta première séance est offerte», with «Laisse-nous tes coordonnées, l’équipe te rappelle pour fixer le créneau.»
  - End side: a black rounded card holding a 2-column form.
- **Form:**
  - 48 px inputs with a black fill and a 40% white ring; red focus.
  - Fields:
    - «Prénom»*, «Nom»*, «Téléphone»* (placeholder «+216»)
    - «E-mail (facultatif)»
    - «Jour souhaité (facultatif)» (today or later)
    - «Offre qui t’intéresse» («Je ne sais pas encore» plus the plans)
    - «Un objectif, une question ? (facultatif)»
  - A full-width red «Réserver mon essai».
- **States:**
  - Plan pre-filled; field errors.
  - Sending: «Envoi…».
  - Success: a green check with «Merci ! On te rappelle très vite pour confirmer ta séance.»
  - Error: «Envoi impossible pour le moment. Appelle-nous ou écris-nous sur Instagram.»

**WEB-11 Location (#acces).**
- **Header:** «Viens nous voir».
- **Panel:**
  - `facade.jpg`, and an embedded Google Map styled dark (inverted, desaturated).
  - «Adresse» with an `led` pin, and the outlined button «Itinéraire Google Maps».
  - «Horaires»: «Lun – Sam 06:00 – 22:00», «Dimanche 08:00 – 14:00».
  - «Contact»: the phone, «contact@meliora-gym.tn» and «@gymmeliora».
- **States:** the phone line hidden while the number is a placeholder; fallback data.

**WEB-12 Instagram band.**
- A full-width `red-500` band with the hex pattern at 40%.
- «Suis la team sur Instagram» and «Transformations, nouveaux cours, coulisses : tout se passe sur @gymmeliora.», in solid white (5.24:1).
- A black button, «Suivre @gymmeliora». There is no post grid.

**WEB-13 Footer.**
- Three black columns:
  - the 56 px logo tile, «Meliora Gym» and the address
  - «Offres», «Planning», «Essai gratuit», «L’app»
  - «Instagram», «Google Maps», «Espace équipe»
- «© 2026 Meliora Gym, Sousse. Tous droits réservés.»
- The columns stack on phones.

**WEB-14 404.** A black page with a giant «404», «Cette page n’existe pas.» and the red button «Retour à l’accueil».

---

## 8. E-mails (EML): 600 px, light, French only

Design the shared layout and every e-mail. The copy and structure are in `n8n/templates/*.html`, and the filled previews are in `n8n/preview/`. Fill the variables from §3. For example: EML-01 for Skander Gharbi (MEL-00539), EML-03 for Amira (240,000 DT), EML-04 for Yassine, EML-05 for Nour, EML-08 and EML-16 for Salma Ayari, and EML-09 for sale V-2026-000412.

**EML-00 Layout** (`layout.html`)
- The page is #F1F1F1, with a 600 px white card (radius 14).
- **Header:** a #0B0B0C band with the 56 px logo tile (radius 10) on the start side. On the end side sits the wordmark «Meliora Gym» in tracked uppercase 13 px bold: white, with «Gym» in `red-400` #EF3B40 (5.03:1).
- A 4 px red rule.
- **Body:** 16/1.6 in #1B1B1B, with 40 px side padding (22 px on phones).
- **Footer:** a #0B0B0C band holding:
  - «Meliora Gym» and the address (plus the phone, when set)
  - the links «Instagram @gymmeliora», «Itinéraire» and «Site web»
  - an optional footer note
  - «© 2026 Meliora Gym — Sousse, Tunisie»

**Blocks** (the template shortcuts)
- kicker: 12 px bold, uppercase, red
- H1: Arial Black 30 px (25 px on phones)
- H2: 18 px
- paragraph
- details table: label | value rows
- note: a #F7F7F7 box with a 4 px red start border
- button: red, radius 8, a 15 px bold white label, 14 × 28 padding

**Constraints**
- Use e-mail-safe nested tables and inline styles, in one column, at most 600 px wide and fluid below 620 px.
- Don't rely on webfonts: use Arial or Helvetica, with Arial Black for the H1.
- Mail clients may invert colours in dark mode, even with `color-scheme: light only`.
  - The logo keeps its white tile.
  - No text sits inside images.
  - Red must stay legible when inverted.
  - Draw forced-dark previews.
- **Change:** the red is #D7141A (5.24:1 on white), replacing #E10600 for the rule, kicker, links, note border and button.
- Small footer text is at least #8C8C8C on #0B0B0C (5.85:1). Today's #6F6F6F copyright line is only 3.9:1.
- No emoji. **Change:** the birthday heading drops its «🎂».

**Inventory**
| ID | Template | Sent when | To | H1 |
|---|---|---|---|---|
| EML-01 | `welcome` | a member is created | member | «Bienvenue chez Meliora, {firstName} !» |
| EML-02 | `subscription-confirmation` | a subscription is created | member | «C’est parti, {firstName} !» |
| EML-03 | `payment-receipt` | a payment is received | member | «Merci, {firstName} !» |
| EML-04 | `expiry-reminder` | a subscription is about to expire | member | «Plus que {daysLabel}, {firstName} !» |
| EML-05 | `renewal-invite` | a subscription has expired | member | «On vous garde une place, {firstName}» |
| EML-06 | `winback-expired` | scheduled follow-up of expired members | member | «Votre abonnement est terminé, pas votre progression» |
| EML-07 | `booking-confirmation` | a class is booked | member | «À bientôt au cours de {sessionTitle} !» |
| EML-08 | `trial-confirmation` | a trial request arrives | prospect | «Bienvenue, {firstName} !» |
| EML-09 | `sale-receipt` | a shop sale is completed | member | «Merci pour votre achat, {firstName} !» |
| EML-10 | `birthday` | the member's birthday | member | «Joyeux anniversaire, {firstName} !» |
| EML-11 | `motivation-premiers-pas` | registered but never came | member | «{firstName}, votre première séance vous attend» |
| EML-12 | `motivation-rappel` | 7–13 days without a visit | member | «{firstName}, on garde le rythme ?» |
| EML-13 | `motivation-encouragement` | 14–29 days without a visit | member | «{firstName}, votre prochaine séance vous attend» |
| EML-14 | `motivation-reprise` | 30 days or more without a visit | member | «{firstName}, et si on repartait ensemble ?» |
| EML-15 | `weekly-schedule` | the Sunday newsletter | member | «Votre semaine chez Meliora, {firstName}» |
| EML-16 | `lead-alert` | a new prospect | team | «{fullName} veut essayer Meliora» |
| EML-17 | `stock-alert` | stock falls below its alert level | owner | «Stock bas : {name}» |
| EML-18 | `maintenance-alert` | a fault is reported | owner | «{title}» |
| EML-19 | `daily-report` | every morning | owner | «Votre journée d’hier en chiffres» |
| EML-20 | `operations-digest` | every Monday | owner | «Votre point hebdomadaire» |
| EML-21 | `motivation-summary` | weekly | owner | «{total} relance(s) envoyée(s) cette semaine» |
| EML-22 | `content-ideas` | Monday Instagram ideas | owner | «{weekTheme}» |

---

## 9. Breakpoints and frame coverage

**Website (375 / 768 / 1280 / 1440)**
- Every section at 1440 and at 375.
- The full page at 768 and at 1280.
- The full page in Arabic (RTL) at 1440 and at 375.
- The hero and header in English at 1440.

**Back-office (1440 desktop, 1024 tablet, 390 phone)**
- Every screen at 1440, in dark.
- **Light versions:** the shell, Dashboard, Members list, Member detail, Planning, Team calendar, Performance and Workflow editor, plus the component sheet.
- **Arabic RTL versions:**
  - the shell, Dashboard, Members list, Member detail, Planning and Team calendar
  - the Workflow editor, with the canvas still left to right
  - one form modal
- **1024:** Login (split), Scanner QR, the Pointage kiosk, the Caisse and the shell.
- **768:** the nav drawer, once, as a component state.
- **390:** the shell with the drawer open, Login (form only), Dashboard, Members list, Member detail, and one form shown as a bottom sheet.

**App (390×844)**
- Every screen and state at 390×844.
- **Checks at 360×800:** Home, Classes, Class detail with the spot picker, Pass, Door, Register and Profile.
- **Arabic RTL:**
  - Sign in, Home, Classes, Class detail and Pass
  - Door (idle and result)
  - Training Progression, with the chart still left to right
  - Profile
- **English:** Home and Class detail.
- Design iOS by default. Show Android only where it differs: the 68 px tab bar, native alerts and the notification shade.

**E-mails:** every e-mail at 600 and at 375, plus forced-dark previews of EML-01, EML-03 and EML-19.

## 10. Proposals (pass 6, optional)
Label each frame `Proposal`.
- **App:**
  - a forgot-password flow
  - push and location priming screens
  - a booking confirmation sheet
  - a restrained "workout complete" moment (no confetti)
  - the payment push opening History on «Paiements»
  - a birth-date picker for Register and Edit profile (both take typed AAAA-MM-JJ today)
  - a profile photo: the API has `avatarUrl`, but the app shows initials
- **Back-office:**
  - desk booking with spot choice
  - the full Performance section on the dashboard
  - a team calendar that compares clocked hours with the hours planned up to now in the current week

## 11. Naming and handoff (pass 7)

**Naming**
- **Pages:** `00 Foundations` · `01 Components` · `02 App` · `03 Back-office` · `04 Website` · `05 E-mails` · `06 Prototypes` · `07 Proposals` · `08 Handoff`. If your canvas has no pages or variants, use one section per page name and keep these names.
- **Frames:** `{ID} {Screen} / {State} / {lang} / {theme} / {width}`, for example:
  - `APP-15 Pass / Offline / FR / Dark / 390`
  - `ADM-29 Team calendar / Day / AR / Light / 1440`
  - `WEB-02 Hero / Fallback / EN / 375`
  - `EML-03 Payment receipt / Forced dark / FR / 375`
- **Components:** family/variant/size, for example `Button/Primary/L`, `Badge/Success`, `Field/Password/Error`, `Card/Class/Booked`.

**Handoff sheet**
- **Tokens:** map each token to its code name, using the "Code" column in §2.3 (for example `red-500` = `--color-brand-500` = `colors.red` = #D7141A). List the new tokens to add.
- **Components:** map each component to its code component.
  - App (`mobile/src/components`): `AuthShell`, `Button`, `Card`, `ClassCard`, `MembershipCard`, `SpotPicker`, `CountdownRing`, `BookingStandingBanner`, `SegmentedControl`, `StatusPill`, `TextField`, `LineChart`, `ModalScreen`, `Screen`, `SectionHeader`, `Logo`, `Toast`, and `States` (`LoadingState`, `ErrorState`, `EmptyState`).
  - Web (`web/src/components/ui`, `web/src/admin/charts`, `web/src/landing`): `Button`, `Badge`, `Card`/`CardHeader`, `StatTile`, `DataTable`, `Pagination`, `Field`, `FormModal`, `Modal`, `ConfirmProvider`/`useConfirm`, `Tabs`, `Spinner`/`Skeleton`, `EmptyState`, `ErrorNote`, `ToastProvider`, `ChartCard`, `TooltipBox` (in `ChartTooltip.tsx`), `LanguageSwitcher`, `HexCeiling`.
  - E-mails: `n8n/templates/layout.html` and the template blocks (kicker, h1, h2, details/row, note, button).
- **Redlines:** for the bold and precision moments (§4).

## 12. Do not

**Style**
- No generic SaaS card-kit look: no pastel gradients, purple accents, illustration spots, or soft rounding on everything. The brand is black, steel, LED white and one red.
- No large red areas beyond the four exceptions in §2.1. No rainbow neon, gold, spa "luxury", or pastel and playful styling.
- No gradients except the photo overlays, the door card, the hero's bottom scrim and the fallback's radial LED glow.
- No single-word accent headlines («Force.», «Power.»), no tracked uppercase kickers above website headings, and no invented slogans. Use the copy given.
- No motion beyond §2.6: no decorative loops, no parallax and no scroll-reveal.

**Images and logo**
- No stock or AI-generated photos of people, gyms, products or food. Use only the four real photos, real uploads in their photo slots, and placeholders everywhere else.
- Never redraw, retrace, recolour, invert, outline, crop or "modernise" the logo.
- Never put the JPEG logo on black without its white tile. Never show it larger than about 80 px, except for the exceptions in §2.8.

**Content**
- No invented prices on the live public site: the fallback is «Tarif en salle».
- No invented features outside labelled proposals: no online payment, no personal-training booking in the app, no notification inbox and no drag-and-drop boards.

**Formats, direction and accessibility**
- No Eastern Arabic digits and no 12-hour clock.
- Never mirror QR codes, logos, photos, chart time axes or the workflow canvas.
- No status shown by colour alone, and no text below the contrast rules in §2.3.
- No emoji in the UI or the e-mails, and no lorem ipsum.
