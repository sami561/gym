# Meliora Gym — application membre (Expo)

Application mobile des membres de **Meliora Gym** (Sousse) : abonnement, pass QR rotatif, ouverture de la porte
depuis le téléphone, réservation des cours (places numérotées, liste d'attente), entraînement (programme,
progression, coaching), historique et profil. Trois langues : français (par défaut), anglais et arabe
(mise en page de droite à gauche).

Stack : Expo SDK 58 · React Native 0.88 · Expo Router (routes dans `src/app/`) · TanStack Query ·
Reanimated 4 · expo-secure-store / location / notifications / brightness / haptics / localization.

## Prérequis

- **Node.js ≥ 22.13** (ou ≥ 24.3). Expo SDK 58 / React Native 0.88 ne tournent pas sur Node 20.
  `nvm install 22 && nvm use 22`, ou le Node de Homebrew (`/opt/homebrew/bin/node`).
- L'API Meliora (gateway) qui tourne, par défaut sur le port `4000` (voir `../backend`).
- Sur téléphone : l'app **Expo Go** (App Store / Play Store), sur le même Wi-Fi que l'ordinateur.

## Lancer en développement

```bash
cd mobile
npm install
cp .env.example .env          # puis renseigner EXPO_PUBLIC_API_URL
npx expo start                # scanner le QR code avec Expo Go (Android) ou l'appareil photo (iOS)
```

`EXPO_PUBLIC_API_URL` = l'origine du gateway, **sans** `/api` :

| Où tourne l'app | Valeur |
|---|---|
| Téléphone réel (Expo Go) | l'IP locale de l'ordinateur, ex. `http://192.168.1.20:4000` (`ipconfig getifaddr en0` sur macOS) — `localhost` ne marche pas depuis le téléphone |
| Simulateur iOS | `http://localhost:4000` |
| Émulateur Android | `http://10.0.2.2:4000` |

Le backend doit autoriser ces origines (CORS) et être joignable depuis le réseau local.
Après un changement de `.env`, relancer avec `npx expo start --clear`.

Comptes : un membre peut créer son compte depuis l'app (« Créer un compte »), ou l'accueil le crée depuis le
back-office. Les comptes staff (ADMIN / STAFF / COACH) sont refusés : l'app est réservée aux membres.

## Fonctionnement des points clés

- **Pass QR** — code `MLR1.<memberCode>.<step>.<sig>` recalculé toutes les 30 s *hors ligne* à partir de la
  clé `GET /api/me/access-key` (gardée dans le trousseau sécurisé), comme décrit dans `docs/API.md`
  (`src/lib/accessCode.ts`). La luminosité de l'écran passe au maximum tant que le pass est affiché.
- **Ouvrir la porte** — demande la position (premier plan uniquement) puis `POST /api/me/doors/:id/open` ;
  le serveur vérifie la distance à la salle (géorepérage) et l'abonnement. Réponse : porte ouverte ou motif du refus.
- **Cours** — places restantes, liste d'attente (avec ma position), fenêtre de réservation (« Réservations ouvertes le … »,
  « Réservations clôturées »), choix de place quand le cours a des places numérotées, délai d'annulation et
  avertissement quand une annulation tardive comptera comme une absence, bannière de suspension
  (`GET /api/me/booking-standing`).
- **Entraînement** — programme actif (exercices cochés localement pour la séance du jour), progression
  (graphique poids / masse grasse / tour de taille, IMC, « Ajouter ma pesée »), séances de coaching.
- **Session** — jetons dans `expo-secure-store`, renouvellement automatique sur 401 (`src/api/client.ts`).

## Langues et RTL

- Langues : **Français** (par défaut), **English**, **العربية**. Au premier lancement, la langue du téléphone
  est utilisée si elle est prise en charge (`expo-localization`), sinon le français. Le choix fait dans
  Profil → Langue est gardé dans le trousseau sécurisé.
- Toutes les chaînes passent par `t()` ; `src/i18n/fr.ts` est la référence et définit le type `Dictionary`,
  donc `en.ts` et `ar.ts` doivent avoir exactement les mêmes clés (vérifié par `tsc`).
- Arabe : arabe standard avec l'usage tunisien (منخرط, حصة, اللقب), police **Cairo** à la place de
  Bebas Neue / Inter, sans espacement des lettres. Dates et nombres via `Intl` en `ar-TN` avec chiffres
  occidentaux (`ar-TN-u-nu-latn`), montants en « د.ت ».
- RTL : passer à l'arabe (ou en sortir) bascule `I18nManager.allowRTL/forceRTL` puis redémarre l'app
  (`reloadAppAsync` d'`expo`). Les chevrons sont inversés, les transitions glissent depuis la gauche,
  le graphique de progression garde un axe du temps de gauche à droite.
- **Expo Go** réinitialise la préférence RTL à l'ouverture d'un projet : le texte passe en arabe mais la mise
  en page suit la langue du téléphone. Pour tester le RTL complet, utiliser un *development build*, ou mettre
  le téléphone en arabe.
- Les messages d'erreur renvoyés par le serveur (et les données comme les horaires) restent en **français**,
  dans toutes les langues de l'app.

## Notifications push

- Les push distantes **ne fonctionnent pas dans Expo Go sur Android** (depuis le SDK 53) : il faut un
  *development build*. Sur iOS, Expo Go les reçoit.
- Il faut un `projectId` EAS : `npx eas-cli@latest init` (l'ajoute dans `app.json` → `extra.eas.projectId`).
  Sans lui, l'app ignore simplement l'enregistrement.
- Le jeton Expo est envoyé à `PUT /api/me/push-token`. Un appui sur une notification `booking.promoted` /
  `booking.reminder` (données `{ type, sessionId }`) ouvre le détail du cours ; `data.url` (chemin Expo Router)
  et `screen: 'payments' | 'membership'` sont aussi gérés.

## Builds (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest init                       # crée le projet EAS et le projectId
npx eas-cli@latest build:configure            # génère eas.json
npx eas-cli@latest build --profile development --platform android   # dev build (push, debug)
npx eas-cli@latest build --profile production --platform all        # stores
```

Définir `EXPO_PUBLIC_API_URL` (URL HTTPS publique du gateway) dans les variables d'environnement EAS
(`eas env:create`) ou dans `eas.json` pour chaque profil. Identifiants : `tn.meliora.gym` (iOS et Android).
L'icône et le splash sont générés à partir du logo fourni (150 px) : remplacez `assets/icon.png`,
`assets/android-icon-foreground.png` et `assets/splash-icon.png` par une version haute définition du logo
avant la publication.

## Vérifications

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
npm run doctor         # expo-doctor
npx expo export --platform android --output-dir /tmp/meliora-export   # le bundle se résout
```

## Structure

```
src/
  app/                 routes Expo Router
    _layout.tsx        polices, providers, routes protégées (connecté / déconnecté)
    sign-in.tsx, register.tsx
    (tabs)/            Accueil · Cours · Pass · Training · Profil
    door.tsx           modale « Ouvrir la porte »
    class/[id].tsx     détail d'un cours (places, liste d'attente, annulation)
    program/[id].tsx   programme d'entraînement
    history.tsx, edit-profile.tsx, change-password.tsx, add-measurement.tsx
  api/                 client HTTP (refresh 401), endpoints, types miroir des contrats backend
  auth/                AuthProvider (session, rôle MEMBER uniquement)
  components/          kit UI (Button, Card, ClassCard, SpotPicker, LineChart, CountdownRing…)
  hooks/               requêtes TanStack Query, clé d'accès, push, actions de réservation
  i18n/                fr.ts (référence), en.ts, ar.ts
  lib/                 code QR, formats (TND, dates), stockage sécurisé, état d'un cours
  theme/               couleurs Meliora (noir, acier, rouge #D7141A), typo, espacements
assets/images/         photos et logo de la salle
```
