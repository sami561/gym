/*
 * Demo data for Meliora Gym, created through the API gateway so every service and
 * event (access read model, webhooks, workflows...) behaves as in production.
 *
 *   npm run seed                 # needs the whole stack running (npm run dev / start)
 *   npm run seed -- --force      # seed again even if plans already exist
 *   npm run seed -- --no-history # skip the SQL back-filling of demo history
 *
 * Demo e-mails use the reserved example.com domain so n8n never mails a real person.
 * Prices, hours and names are placeholders to confirm with the gym.
 */
require('dotenv').config();
const { Client } = require('pg');

const API = (process.env.SEED_API_URL || `http://localhost:${process.env.GATEWAY_PORT || 4000}`) + '/api';
const args = new Set(process.argv.slice(2));
const DAY = 86_400_000;

async function api(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new Error(`${method} ${path} → ${res.status} ${message ?? text}`);
  }
  return data;
}

const pad = (n) => String(n).padStart(2, '0');
const dateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysFromToday = (n) => dateOnly(new Date(Date.now() + n * DAY));
const at = (dayOffset, hh, mm = 0) => {
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const pick = (list, i) => list[((i % list.length) + list.length) % list.length];
const log = (...m) => console.log('•', ...m);

const FIRST = ['Yassine', 'Amira', 'Mehdi', 'Sarra', 'Aymen', 'Ines', 'Karim', 'Nour', 'Bilel', 'Rania', 'Hamza', 'Mariem',
  'Oussama', 'Salma', 'Firas', 'Asma', 'Anis', 'Eya', 'Wassim', 'Hiba', 'Skander', 'Yasmine', 'Ghassen', 'Chaima'];
const LAST = ['Ben Salah', 'Trabelsi', 'Gharbi', 'Jaziri', 'Mejri', 'Hammami', 'Bouazizi', 'Chaabane', 'Sassi', 'Khelifi',
  'Dridi', 'Ayari', 'Mansouri', 'Ferchichi', 'Zouari', 'Baccar'];

async function main() {
  const login = await api('POST', '/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@meliora-gym.tn',
    password: process.env.ADMIN_PASSWORD || 'Meliora2026!',
  });
  const T = login.accessToken;
  log(`connected as ${login.user.email}`);

  const existing = await api('GET', '/plans?includeInactive=true', undefined, T);
  if (existing.length && !args.has('--force')) {
    console.log('Already seeded (plans exist). Use --force to add the demo data again.');
    return;
  }

  // ---------- Plans & promo ----------
  const plans = {};
  for (const p of [
    { key: 'month', name: 'Mensuel', durationDays: 30, price: 90, sortOrder: 1,
      features: ['Plateau musculation & cardio', 'Application Meliora + pass QR', 'Accès 7j/7 aux horaires d’ouverture'] },
    { key: 'quarter', name: 'Trimestriel', durationDays: 90, price: 240, sortOrder: 2, isFeatured: true,
      features: ['Tout le Mensuel', 'Cours collectifs illimités', '1 séance avec un coach offerte'] },
    { key: 'semester', name: 'Semestriel', durationDays: 180, price: 450, sortOrder: 3,
      features: ['Tout le Trimestriel', 'Bilan corporel tous les 2 mois'] },
    { key: 'year', name: 'Annuel', durationDays: 365, price: 800, sortOrder: 4,
      features: ['Tout le Semestriel', 'Programme personnalisé', 'Casier attribué'] },
    { key: 'student', name: 'Étudiant', durationDays: 30, price: 70, sortOrder: 5,
      features: ['Sur présentation de la carte étudiant', 'Plateau musculation & cardio'] },
  ]) {
    const { key, ...body } = p;
    plans[key] = await api('POST', '/plans', body, T);
  }
  await api('POST', '/promos', { code: 'BIENVENUE10', type: 'PERCENT', value: 10, maxUses: 100, description: 'Bienvenue : -10 % sur le premier abonnement' }, T);
  log('plans + promo code');

  // ---------- Staff accounts & employees ----------
  const coaches = [];
  for (const [i, c] of [
    { firstName: 'Ahmed', lastName: 'Kefi', specialty: 'Musculation & force', bio: 'Préparateur physique, 8 ans d’expérience.' },
    { firstName: 'Leila', lastName: 'Mzoughi', specialty: 'Cross-training & HIIT', bio: 'Coach certifiée cross-training.' },
    { firstName: 'Sami', lastName: 'Rekik', specialty: 'Cycling & cardio', bio: 'Spécialiste endurance et perte de poids.' },
  ].entries()) {
    coaches.push(await api('POST', '/users', { ...c, role: 'COACH', email: `coach${i + 1}@example.com`, password: 'Coach2026!' }, T));
  }
  const reception = await api('POST', '/users', {
    firstName: 'Nadia', lastName: 'Belhaj', role: 'STAFF', email: 'accueil@example.com', password: 'Accueil2026!',
  }, T);

  const employees = [];
  const employeeInputs = [
    ...coaches.map((c, i) => ({ userId: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, position: 'COACH',
      contractType: i === 2 ? 'FREELANCE' : 'CDI', salaryType: i === 2 ? 'PER_SESSION' : 'MONTHLY', baseSalary: i === 2 ? 35 : 1400, commissionRate: 0.3 })),
    { userId: reception.id, firstName: 'Nadia', lastName: 'Belhaj', email: reception.email, position: 'RECEPTION', contractType: 'CDI', salaryType: 'MONTHLY', baseSalary: 950 },
    { firstName: 'Hedi', lastName: 'Saidi', position: 'RECEPTION', contractType: 'CDD', salaryType: 'MONTHLY', baseSalary: 900 },
    { firstName: 'Fatma', lastName: 'Ouni', position: 'CLEANING', contractType: 'CDI', salaryType: 'HOURLY', baseSalary: 6 },
    { firstName: 'Mourad', lastName: 'Tlili', position: 'MAINTENANCE', contractType: 'FREELANCE', salaryType: 'HOURLY', baseSalary: 12 },
  ];
  for (const e of employeeInputs) {
    employees.push(await api('POST', '/employees', { ...e, hireDate: daysFromToday(-400) }, T));
  }
  // This week's roster: morning and evening shifts.
  const [ahmed, leila, sami, nadia, hedi, fatma] = employees;
  for (let d = 0; d < 7; d++) {
    const sunday = new Date(Date.now() + d * DAY).getDay() === 0;
    if (sunday) {
      await api('POST', '/shifts', { employeeId: hedi.id, startsAt: at(d, 8), endsAt: at(d, 14), task: 'Accueil' }, T);
      continue;
    }
    await api('POST', '/shifts', { employeeId: nadia.id, startsAt: at(d, 6), endsAt: at(d, 14), task: 'Accueil' }, T);
    await api('POST', '/shifts', { employeeId: hedi.id, startsAt: at(d, 14), endsAt: at(d, 22), task: 'Accueil' }, T);
    await api('POST', '/shifts', { employeeId: fatma.id, startsAt: at(d, 5, 30), endsAt: at(d, 9, 30), task: 'Ménage vestiaires', roomName: 'Vestiaire Hommes' }, T);
    await api('POST', '/shifts', { employeeId: ahmed.id, startsAt: at(d, 7), endsAt: at(d, 13), task: 'Plateau musculation', roomName: 'Plateau musculation' }, T);
    await api('POST', '/shifts', { employeeId: d % 2 ? leila.id : sami.id, startsAt: at(d, 16), endsAt: at(d, 22), task: 'Cours & plateau' }, T);
  }
  log(`${coaches.length} coaches, 1 receptionist account, ${employees.length} employees, roster for 7 days`);

  // ---------- Classes (2 weeks) ----------
  const classPlan = [
    { title: 'Cross-training', coach: 1, room: 'Zone cross-training', color: '#D7141A', hh: 19, minutes: 60, capacity: 16, days: [1, 3, 5] },
    { title: 'Cycling', coach: 2, room: 'Salle cours collectifs', color: '#2563EB', hh: 18, mm: 30, minutes: 45, capacity: 20, spotSelection: true, days: [2, 4] },
    { title: 'Body Pump', coach: 0, room: 'Salle cours collectifs', color: '#7C3AED', hh: 7, minutes: 60, capacity: 18, days: [1, 4] },
    { title: 'HIIT Express', coach: 1, room: 'Zone cross-training', color: '#EA580C', hh: 12, mm: 30, minutes: 30, capacity: 14, days: [2, 5] },
    { title: 'Stretching & mobilité', coach: 2, room: 'Salle cours collectifs', color: '#059669', hh: 10, minutes: 50, capacity: 20, days: [6] },
  ];
  let sessions = [];
  for (let d = 0; d < 7; d++) {
    const weekday = new Date(Date.now() + d * DAY).getDay();
    for (const c of classPlan.filter((x) => x.days.includes(weekday))) {
      const startsAt = at(d, c.hh, c.mm ?? 0);
      const endsAt = new Date(Date.parse(startsAt) + c.minutes * 60_000).toISOString();
      const created = await api('POST', '/classes', {
        title: c.title, coachId: coaches[c.coach].id, room: c.room, color: c.color, startsAt, endsAt,
        capacity: c.capacity, spotSelection: Boolean(c.spotSelection), waitlistCapacity: 10, repeatWeeks: 1,
        description: `${c.title} avec ${coaches[c.coach].firstName}.`,
      }, T);
      sessions = sessions.concat(created);
    }
  }
  log(`${sessions.length} class sessions over 2 weeks`);

  // ---------- Members with 12 months of history ----------
  const planCycle = ['month', 'quarter', 'month', 'year', 'student', 'semester', 'month', 'quarter'];
  const members = [];
  for (let i = 0; i < 24; i++) {
    const firstName = FIRST[i];
    const lastName = pick(LAST, i * 3);
    const email = `${firstName}.${lastName}`.toLowerCase().normalize('NFD').replace(/[^a-z.]/g, '') + `${i}@example.com`;
    const created = await api('POST', '/members', {
      firstName, lastName, email, password: 'Membre2026!',
      phone: `+216 ${20 + (i % 9)} ${100 + i * 7} ${300 + i * 11}`.slice(0, 18),
      gender: i % 2 ? 'FEMALE' : 'MALE',
      birthDate: `${1975 + ((i * 7) % 30)}-${pad(1 + (i % 12))}-${pad(1 + ((i * 5) % 27))}`,
    }, T);
    members.push(created.member);
    // History: chained subscriptions starting up to 12 months ago; a few lapse.
    const plan = plans[pick(planCycle, i)];
    let start = -((i * 13) % 330) - 20;
    while (start < 0) {
      const ends = start + plan.durationDays - 1;
      const lapsed = i % 7 === 3 && ends > -40 && ends < 0;
      const sub = await api('POST', `/members/${created.member.id}/subscriptions`, {
        planId: plan.id, startDate: daysFromToday(start),
      }, T);
      await api('POST', `/members/${created.member.id}/payments`, {
        amount: sub.price, method: pick(['CASH', 'CARD', 'D17', 'TRANSFER', 'CASH'], i + start),
        subscriptionId: sub.id, paidAt: new Date(Date.now() + start * DAY + 10 * 3_600_000).toISOString(),
      }, T);
      if (lapsed) break;
      start = ends + 1;
    }
  }
  const mid = members[5];
  const profile = await api('GET', `/members/${mid.id}`, undefined, T);
  const current = profile.membership.current;
  if (current) await api('POST', `/subscriptions/${current.id}/freeze`, { days: 14, reason: 'Voyage' }, T);
  await api('PUT', `/members/${members[0].id}/card`, { cardNumber: '0012345678' }, T);
  log(`${members.length} members with subscriptions and payments over 12 months`);

  // ---------- Bookings (booked from the desk, as reception would) ----------
  const upcoming = sessions.filter((s) => Date.parse(s.startsAt) > Date.now() + 3_600_000).slice(0, 8);
  let booked = 0;
  for (const [i, s] of upcoming.entries()) {
    for (const [j, m] of members.slice((i * 3) % 18, ((i * 3) % 18) + 6).entries()) {
      const spotNumber = s.spotSelection ? j * 3 + 1 : undefined;
      await api('POST', `/classes/${s.id}/bookings`, { memberId: m.id, spotNumber }, T)
        .then(() => booked++)
        .catch(() => undefined); // inactive / frozen members or booking not open yet
    }
  }
  log(`${booked} class bookings`);

  // ---------- CRM ----------
  for (const [i, l] of [
    { firstName: 'Khalil', lastName: 'Hamdi', phone: '+216 22 111 222', source: 'INSTAGRAM', notes: 'Intéressé par le cross-training' },
    { firstName: 'Emna', lastName: 'Jebali', phone: '+216 55 333 444', email: 'emna.jebali@example.com', source: 'WEBSITE', trialDate: daysFromToday(2) },
    { firstName: 'Rami', lastName: 'Gabsi', phone: '+216 98 555 666', source: 'WALK_IN' },
    { firstName: 'Olfa', lastName: 'Kammoun', phone: '+216 29 777 888', source: 'REFERRAL', notes: 'Amie de Sarra' },
    { firstName: 'Tarek', lastName: 'Bouzid', phone: '+216 50 999 000', source: 'FACEBOOK' },
  ].entries()) {
    const lead = await api('POST', '/leads', { ...l, interestPlanId: plans[pick(['month', 'quarter', 'year'], i)].id, followUpAt: daysFromToday(i - 2) }, T);
    if (i % 2 === 0) await api('POST', `/leads/${lead.id}/activities`, { type: 'CALL', note: 'Premier appel, rappeler en fin de semaine.' }, T);
  }
  log('5 leads');

  // ---------- Facility ----------
  const rooms = await api('GET', '/rooms', undefined, T);
  const room = (name) => rooms.find((r) => r.name.toLowerCase().includes(name))?.id;
  const machines = [
    ['Tapis de course', 'CARDIO', 'Technogym', 'cardio', 4, 90],
    ['Vélo elliptique', 'CARDIO', 'Matrix', 'cardio', 3, 90],
    ['Vélo de cycling', 'CARDIO', 'Keiser', 'cours', 20, 180],
    ['Rack à squat', 'STRENGTH', 'Eleiko', 'musculation', 2, 180],
    ['Presse à cuisses', 'STRENGTH', 'Panatta', 'musculation', 1, 120],
    ['Haltères 2-40 kg', 'FREE_WEIGHTS', 'Eleiko', 'musculation', 1, 365],
    ['Rameur', 'CARDIO', 'Concept2', 'cross', 4, 120],
  ];
  let firstMachine;
  for (const [name, category, brand, where, count, interval] of machines) {
    for (let n = 1; n <= Math.min(count, 4); n++) {
      const eq = await api('POST', '/equipment', {
        name: count > 1 ? `${name} #${n}` : name, category, brand, roomId: room(where) ?? null,
        purchaseDate: daysFromToday(-500), purchasePrice: category === 'CARDIO' ? 4500 : 2200,
        warrantyUntil: daysFromToday(230), maintenanceIntervalDays: interval, lastMaintenanceAt: daysFromToday(-interval + 5),
      }, T);
      firstMachine ??= eq;
    }
  }
  await api('POST', '/maintenance', { equipmentId: firstMachine.id, title: 'Bande de roulement qui accroche', priority: 'HIGH', reportedByName: 'Nadia (accueil)' }, T);
  const vestH = room('hommes');
  const vestF = room('femmes');
  if (vestH) await api('POST', '/lockers', { roomId: vestH, prefix: 'H-', from: 1, to: 20 }, T);
  if (vestF) await api('POST', '/lockers', { roomId: vestF, prefix: 'F-', from: 1, to: 20 }, T);
  log('equipment, 1 maintenance ticket, 40 lockers');

  // ---------- Shop, sales & expenses ----------
  const products = [];
  for (const p of [
    { name: 'Whey protéine 2 kg', category: 'SUPPLEMENT', price: 165, cost: 120, stock: 8, lowStockThreshold: 3 },
    { name: 'Créatine 300 g', category: 'SUPPLEMENT', price: 75, cost: 48, stock: 10, lowStockThreshold: 3 },
    { name: 'Eau minérale 0,5 L', category: 'DRINK', price: 1, cost: 0.45, stock: 120, lowStockThreshold: 24 },
    { name: 'Boisson énergétique', category: 'DRINK', price: 4.5, cost: 2.6, stock: 48, lowStockThreshold: 12 },
    { name: 'Barre protéinée', category: 'SNACK', price: 6, cost: 3.5, stock: 40, lowStockThreshold: 10 },
    { name: 'T-shirt Meliora', category: 'APPAREL', price: 35, cost: 15, stock: 25, lowStockThreshold: 5 },
    { name: 'Gants d’entraînement', category: 'ACCESSORY', price: 28, cost: 14, stock: 12, lowStockThreshold: 4 },
    { name: 'Séance avec un coach', category: 'SERVICE', price: 40 },
  ]) {
    products.push(await api('POST', '/products', p, T));
  }
  for (let i = 0; i < 14; i++) {
    const items = [{ productId: pick(products, i).id, quantity: 1 + (i % 3) }, { productId: products[2].id, quantity: 2 }];
    const m = i % 3 === 0 ? members[i] : null;
    await api('POST', '/sales', { items, memberId: m?.id, paymentMethod: pick(['CASH', 'CARD', 'D17'], i), discount: i % 5 === 0 ? 2 : 0 }, T);
  }
  for (let month = 0; month < 4; month++) {
    const d = new Date();
    d.setMonth(d.getMonth() - month, 5);
    const date = dateOnly(d);
    await api('POST', '/expenses', { category: 'RENT', label: 'Loyer du local', amount: 2800, date, paymentMethod: 'TRANSFER' }, T);
    await api('POST', '/expenses', { category: 'UTILITIES', label: 'STEG (électricité)', amount: 620 + month * 35, date, paymentMethod: 'TRANSFER' }, T);
    await api('POST', '/expenses', { category: 'MARKETING', label: 'Publicité Instagram', amount: 250, date, paymentMethod: 'CARD' }, T);
  }
  log(`${products.length} products, 14 POS sales, 12 expenses`);

  // ---------- Training ----------
  const exercises = await api('GET', '/exercises', undefined, T);
  const ex = (i) => exercises[i % exercises.length];
  const target = members[1];
  await api('POST', '/programs', {
    memberId: target.id, coachId: coaches[0].id, title: 'Prise de force — 3 jours', goal: 'Force et hypertrophie',
    startDate: daysFromToday(-14), weeks: 8,
    days: ['Jour 1 — Haut du corps', 'Jour 2 — Bas du corps', 'Jour 3 — Full body'].map((label, d) => ({
      label,
      exercises: [0, 1, 2, 3].map((k) => ({ exerciseId: ex(d * 4 + k).id, name: ex(d * 4 + k).name, sets: 4, reps: '8-10', restSeconds: 90, weightKg: null, notes: null })),
    })),
  }, T);
  for (let w = 0; w < 6; w++) {
    await api('POST', `/members/${target.id}/measurements`, {
      date: daysFromToday(-35 + w * 7), weightKg: 84 - w * 0.6, heightCm: w === 0 ? 178 : undefined, bodyFatPct: 22 - w * 0.4, waistCm: 92 - w * 0.5,
    }, T);
  }
  await api('POST', '/pt-sessions', { coachId: coaches[0].id, memberId: target.id, startsAt: at(1, 17), endsAt: at(1, 18), price: 40 }, T);
  log('1 workout program, 6 measurements, 1 PT session');

  // ---------- Doors ----------
  const door = await api('POST', '/doors', { name: 'Porte principale', location: 'Entrée Rue Colonel Garnaoui', driver: 'SIMULATOR', unlockSeconds: 5 }, T);
  const agent = await api('POST', '/agents', { name: 'PC accueil' }, T);
  log(`door "${door.name}" (simulator) and door agent "${agent.agent.name}" — agent key (shown once): ${agent.apiKey}`);

  if (!args.has('--no-history')) await backfillHistory(members, door.id);

  console.log('\nDone. Logins (demo):');
  console.log(`  admin      ${login.user.email} / (ADMIN_PASSWORD)`);
  console.log('  reception  accueil@example.com / Accueil2026!');
  console.log('  coach      coach1@example.com / Coach2026!');
  console.log(`  member     ${members[1].email} / Membre2026!`);
}

/** Demo only: 30 days of check-ins and realistic join dates, written directly in SQL. */
async function backfillHistory(members, doorId) {
  const conn = (db) =>
    new Client({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: db,
    });
  const access = conn(process.env.ACCESS_DB_NAME || 'meliora_access');
  await access.connect();
  let rows = 0;
  for (let d = 30; d >= 1; d--) {
    for (const [i, m] of members.entries()) {
      if ((i + d) % 3 === 0 || (i % 7 === 3 && d < 25)) continue;
      const hour = [6, 7, 8, 12, 17, 18, 19, 20][(i + d) % 8];
      const when = new Date(Date.now() - d * DAY);
      when.setHours(hour, (i * 7) % 60, 0, 0);
      await access.query(
        `INSERT INTO access_logs (id, "memberId", "memberName", "memberCode", "doorId", "doorName", method, result, reason, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Porte principale', $5, 'GRANTED', 'demo', $6)`,
        [m.id, `${m.firstName} ${m.lastName}`, m.memberCode, doorId, ['QR', 'APP', 'QR', 'CARD'][(i + d) % 4], when],
      ).catch((e) => {
        if (rows === 0) throw e;
      });
      rows++;
    }
  }
  await access.end();
  const membership = conn(process.env.MEMBERSHIP_DB_NAME || 'meliora_membership');
  await membership.connect();
  await membership.query(
    `UPDATE members m SET "joinedAt" = s.first::timestamptz + interval '10 hours'
       FROM (SELECT "memberId", MIN("startDate") AS first FROM subscriptions GROUP BY "memberId") s
      WHERE s."memberId" = m.id AND m.email LIKE '%@example.com'`,
  );
  await membership.end();
  log(`${rows} demo check-ins over 30 days, join dates aligned with first subscriptions`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
