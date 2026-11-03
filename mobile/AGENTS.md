This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Meliora project notes

- Member-only app for Meliora Gym. API contract: `../docs/API.md`; mirror backend types in `src/api/types.ts`
  (never import from `../backend`).
- Node ≥ 22.13 is required (SDK 58 / RN 0.88); the default nvm Node 20 fails.
- Every user-facing string goes through `useI18n().t()`: add the key to `src/i18n/fr.ts` first (the
  reference type), then to `en.ts` and `ar.ts` (same placeholders). Server error messages are French and
  are shown as-is in every language (`src/lib/errors.ts`).
- Arabic is RTL: use logical styles (`start`/`end`, `marginStart`, `paddingStart`) instead of left/right,
  mirror directional glyphs with `mirrorInRTL`, and render text through `AppText` (it swaps in the Cairo
  font). Direction changes reload the app (`src/lib/direction.ts`); Expo Go cannot apply forced RTL.
- Data access goes through the hooks in `src/hooks/queries.ts`; invalidate the related query keys after mutations.
- Membership status (`membershipKind` in `src/components/MembershipCard.tsx`): `active`, `frozen`, `scheduled`
  (paid in advance, not started yet: keys `membership.scheduled` and `membership.startsOn`), `expired`,
  `suspended` or `none`. The card and the pass screen label it `membership.<kind>` (no placeholders) and colour
  it with `membershipTone`. Once expired, the card shows the last non-cancelled subscription by end date
  (`statusSubscription`), like the back-office member list.
- Class booking follows class-service's boundaries: booking is closed from `bookingClosesAt` itself, and a
  cancellation is late (a strike) from `cancelDeadline` itself (`now >=`). Use `classAction` and
  `isLateCancellation` (`src/lib/classState.ts`), never an inline comparison.
- Reanimated shared values: use `.get()` / `.set()` (React Compiler lint rule), and respect `useReducedMotion()`
  for looping animations.
- Keep `src/lib/accessCode.ts` byte-for-byte compatible with `backend/libs/common/src/utils/access-code.ts`.
- Member photo (`docs/API.md`, "Member photos"): render it with `MemberAvatar` (initials underneath). Its source
  (`memberPhotoSource`, `src/lib/memberPhoto.ts`) is `GET /api/me/photo?v=` with the bearer token in the image
  headers (`useAccessToken` re-renders after each refresh) and an expo-image cache key per member + version, seeded
  with the uploaded file and cleared at sign-out. `src/app/change-photo.tsx` picks (expo-image-picker, square crop;
  only the camera needs a permission: refused → message + `Linking.openSettings()`), prepares (`preparePhoto`:
  expo-image-manipulator, 600×600 JPEG from quality 0.85 down until ≤ 512 KB, no EXIF) and sends multipart field
  `photo`. Both modules are in Expo Go; the French permission texts (`expo-image-picker` plugin in `app.json`,
  microphone blocked) only apply in a development or store build.
- Tests: Jest with the `jest-expo` preset (`npm test`), `*.test.ts` next to the code, helpers in
  `src/test/`. `jest.config.js` pins `TZ=Africa/Tunis`. The suites enforce: en/ar keys and
  `{placeholders}` match fr, `t()` parameters match the placeholders, fonts are loaded in
  `src/app/_layout.tsx`, access codes match fixed vectors computed with Node's crypto (the backend's
  algorithm). Skipped tests pin known bugs — unskip them with the fix. Before declaring a task done:
  `npm run typecheck && npm run lint && npm test`.
