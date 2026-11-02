/* Sample data used by validate.mjs to run every Code node the way n8n would. */

const DAY = 86_400_000;
const now = Date.now();
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();
const dateOnly = (offsetDays) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10);

export const ENV = {
  MELIORA_API_URL: 'http://gateway:4000',
  MELIORA_LOGO_URL: 'https://meliora-gym.tn/images/logo.jpg',
  MELIORA_WEBSITE_URL: 'https://meliora-gym.tn',
  MELIORA_APP_URL: 'https://meliora-gym.tn/app',
  MELIORA_ADMIN_URL: 'https://meliora-gym.tn/admin',
  MELIORA_FROM_EMAIL: 'Meliora Gym <contact@meliora-gym.tn>',
  MELIORA_OWNER_EMAIL: 'gerant@meliora-gym.tn',
  MELIORA_STAFF_EMAIL: 'accueil@meliora-gym.tn',
  MELIORA_GYM_PHONE: '+216 73 000 000',
  MELIORA_WHATSAPP: '+216 73 000 000',
  MELIORA_BIRTHDAY_OFFER: 'Venez avec un ami cette semaine : sa séance est offerte.',
  MELIORA_WINBACK_OFFER: '',
  MELIORA_MOTIVATION_AI: 'false',
};

const envelope = (event, data) => ({
  headers: { 'x-meliora-event': event },
  body: { id: `evt-${event}`, event, occurredAt: iso(0), data },
});

export const WEBHOOK_EVENTS = {
  'member.created': envelope('member.created', {
    memberId: 'm1',
    memberCode: 'MEL-00042',
    firstName: 'Yassine',
    lastName: 'Trabelsi',
    email: 'yassine@example.com',
    phone: '+216 20 000 001',
    status: 'ACTIVE',
    joinedAt: iso(0),
  }),
  'subscription.created': envelope('subscription.created', {
    subscriptionId: 's1',
    memberId: 'm1',
    memberCode: 'MEL-00042',
    firstName: 'Yassine',
    lastName: 'Trabelsi',
    email: 'yassine@example.com',
    phone: null,
    planName: 'Trimestriel',
    startDate: dateOnly(0),
    endDate: dateOnly(90),
    price: 270,
  }),
  'payment.received': envelope('payment.received', {
    paymentId: 'clx9payment00abcdef12',
    memberId: 'm1',
    memberCode: 'MEL-00042',
    firstName: 'Yassine',
    lastName: 'Trabelsi',
    email: 'yassine@example.com',
    amount: 270,
    method: 'D17',
    reference: 'D17-778899',
    planName: 'Trimestriel',
    paidAt: iso(0),
  }),
  'subscription.expiring': envelope('subscription.expiring', {
    subscriptionId: 's2',
    memberId: 'm2',
    firstName: 'Ines',
    lastName: 'Gharbi',
    email: 'ines@example.com',
    phone: null,
    planName: 'Mensuel',
    endDate: dateOnly(3),
    daysLeft: 3,
  }),
  'subscription.expired': envelope('subscription.expired', {
    subscriptionId: 's3',
    memberId: 'm3',
    firstName: 'Karim',
    lastName: 'Jaziri',
    email: 'karim@example.com',
    phone: null,
    planName: 'Mensuel',
    endDate: dateOnly(-1),
  }),
  'booking.created': envelope('booking.created', {
    bookingId: 'b1',
    sessionId: 'c1',
    memberId: 'm2',
    memberName: 'Ines Gharbi',
    email: 'ines@example.com',
    sessionTitle: 'Cross Training',
    startsAt: iso(2 * DAY),
    endsAt: iso(2 * DAY + 3_600_000),
    coachName: 'Coach Amine',
    room: 'Salle Cardio',
  }),
  'lead.created': envelope('lead.created', {
    leadId: 'l1',
    firstName: 'Sarra',
    lastName: 'Ben Ammar',
    phone: '+216 55 000 111',
    email: 'sarra@example.com',
    source: 'INSTAGRAM',
    trialDate: dateOnly(2),
    interestPlanName: 'Mensuel',
    message: 'Je voudrais essayer les cours de Zumba <3',
  }),
  'sale.completed': envelope('sale.completed', {
    saleId: 'sale1',
    number: 'V-2026-0157',
    memberId: 'm1',
    memberName: 'Yassine Trabelsi',
    email: 'yassine@example.com',
    items: [
      { name: 'Whey Protein 2 kg', quantity: 1, unitPrice: 189, total: 189 },
      { name: 'Shaker Meliora', quantity: 2, unitPrice: 15, total: 30 },
    ],
    total: 219,
    paymentMethod: 'CARD',
    createdAt: iso(0),
  }),
  'stock.low': envelope('stock.low', { productId: 'p1', name: 'Eau minérale 1,5 L', stock: 4, threshold: 12 }),
  'maintenance.opened': envelope('maintenance.opened', {
    ticketId: 't1',
    title: 'Tapis de course n°3 : courroie qui glisse',
    priority: 'HIGH',
    equipmentName: 'Tapis de course n°3',
    roomName: 'Salle Cardio',
    cost: null,
    at: iso(0),
  }),
};

export const SESSIONS = [
  { id: 'c1', title: 'Cross Training', description: null, coachId: 'u1', coachName: 'Coach Amine', room: 'Salle Cross', color: '#E10600', startsAt: iso(1 * DAY), endsAt: iso(1 * DAY + 3_600_000), capacity: 16, bookedCount: 11 },
  { id: 'c2', title: 'Zumba', description: null, coachId: 'u2', coachName: 'Coach Nour', room: 'Studio', color: null, startsAt: iso(1 * DAY + 7_200_000), endsAt: iso(1 * DAY + 10_800_000), capacity: 20, bookedCount: 20 },
  { id: 'c3', title: 'Body Pump', description: null, coachId: null, coachName: null, room: null, color: null, startsAt: iso(3 * DAY), endsAt: iso(3 * DAY + 3_600_000), capacity: 18, bookedCount: 6 },
  { id: 'c4', title: 'Yoga & mobilité', description: null, coachId: 'u3', coachName: 'Coach Salma', room: 'Studio', color: null, startsAt: iso(5 * DAY), endsAt: iso(5 * DAY + 3_600_000), capacity: 12, bookedCount: 3 },
];

export const RECIPIENTS = [
  { memberId: 'm1', firstName: 'Yassine', lastName: 'Trabelsi', email: 'yassine@example.com', phone: null },
  { memberId: 'm2', firstName: 'Ines', lastName: 'Gharbi', email: 'ines@example.com', phone: null },
  { memberId: 'm9', firstName: 'Sans', lastName: 'Email', email: '', phone: null },
];

export const BIRTHDAYS = [{ memberId: 'm4', firstName: 'Amira', lastName: 'Ben Salah', email: 'amira@example.com', phone: null, age: 29 }];

export const INACTIVE = [
  { memberId: 'm5', firstName: 'Mehdi', lastName: 'Sassi', email: 'mehdi@example.com', phone: null, lastVisitAt: iso(-9 * DAY), daysSinceVisit: 9 },
  { memberId: 'm6', firstName: 'Rim', lastName: 'Khelifi', email: 'rim@example.com', phone: null, lastVisitAt: iso(-20 * DAY), daysSinceVisit: 20 },
  { memberId: 'm7', firstName: 'Hatem', lastName: 'Dridi', email: 'hatem@example.com', phone: null, lastVisitAt: iso(-45 * DAY), daysSinceVisit: 45 },
  { memberId: 'm8', firstName: 'Olfa', lastName: 'Mansour', email: 'olfa@example.com', phone: null, lastVisitAt: null, daysSinceVisit: null },
  { memberId: 'm10', firstName: 'Sans', lastName: 'Email', email: null, phone: null, lastVisitAt: iso(-12 * DAY), daysSinceVisit: 12 },
  { memberId: 'm11', firstName: 'Trop', lastName: 'Récent', email: 'recent@example.com', phone: null, lastVisitAt: iso(-3 * DAY), daysSinceVisit: 3 },
];

export const EXPIRED = [
  { memberId: 'm3', firstName: 'Karim', lastName: 'Jaziri', email: 'karim@example.com', phone: null, planName: 'Mensuel', endDate: dateOnly(-5), daysSinceExpiry: 5 },
];

export const DAILY_REPORT = {
  date: dateOnly(-1),
  membership: { date: dateOnly(-1), revenue: 1240.5, payments: 9, newMembers: 3, newSubscriptions: 5, expiringNext7Days: 7 },
  access: { checkIns: 183, uniqueVisitors: 141, denied: 4 },
  classes: { sessionsToday: 6, upcomingBookings: 48, fillRate30d: 0.72 },
};

export const GYM = {
  name: 'Meliora Gym',
  tagline: 'Forge ta meilleure version',
  address: 'Khzema Est, Rue Colonel Garnaoui',
  city: 'Sousse 4051, Tunisie',
  phone: '+216 73 000 000',
  email: 'contact@meliora-gym.tn',
  instagram: 'https://www.instagram.com/gymmeliora/',
  mapsUrl: 'https://maps.app.goo.gl/CVWB98nx2RdSd8Mw8',
  location: { lat: 35.8456, lng: 10.6178 },
  geofenceMeters: 150,
  openingHours: [
    { days: 'Lun – Sam', open: '06:00', close: '22:00' },
    { days: 'Dimanche', open: '08:00', close: '14:00' },
  ],
};

export const CLAUDE_IDEAS = {
  weekTheme: 'Semaine « Forge ta régularité »',
  posts: [
    {
      title: 'Le Cross Training de mardi',
      caption: 'Mardi soir, on transpire ensemble 🔥\nCross Training avec Coach Amine : 11 inscrits, il reste 5 places.\nRéserve dans l’app Meliora !',
      visualIdea: 'Reel 15 s : montée d’intensité sur les burpees, lumière hexagonale en fond.',
      bestDay: 'Lundi',
      hashtags: ['#Sousse', '#CrossTraining'],
    },
    {
      title: 'Zumba complet',
      caption: 'La Zumba de Coach Nour affiche complet ! Rejoins la liste d’attente.',
      visualIdea: 'Carrousel photos du dernier cours.',
      bestDay: 'Mercredi',
      hashtags: ['#Zumba', '#Tunisie'],
    },
    {
      title: 'Yoga & mobilité',
      caption: 'Samedi, on prend soin des articulations avec Coach Salma.',
      visualIdea: 'Photo calme au studio, lumière du matin.',
      bestDay: 'Vendredi',
      hashtags: ['#Yoga', '#Mobilité'],
    },
  ],
  stories: [
    { day: 'Lundi', idea: 'Quel cours vas-tu tester cette semaine ?', interactive: 'Sondage' },
    { day: 'Mercredi', idea: 'Coulisses de la préparation du Cross Training', interactive: 'Question' },
  ],
  hashtags: ['#MelioraGym', '#Sousse', '#Fitness', '#Tunisie'],
};

export const claudeMessage = (payload) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text: JSON.stringify(payload) }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 900, output_tokens: 400 },
});

export const LEADS = [
  { id: 'l1', firstName: 'Sarra', lastName: 'Ben Ammar', phone: '+216 55 000 111', email: 'sarra@example.com', source: 'INSTAGRAM', status: 'TRIAL', interestPlanId: null, interestPlanName: 'Mensuel', trialDate: dateOnly(-2), followUpAt: dateOnly(0), notes: null, assignedToName: 'Accueil', convertedMemberId: null, createdAt: iso(-3 * DAY) },
  { id: 'l2', firstName: 'Walid', lastName: 'Hamdi', phone: '+216 98 000 222', email: null, source: 'WALK_IN', status: 'CONTACTED', interestPlanId: null, interestPlanName: null, trialDate: null, followUpAt: dateOnly(-1), notes: null, assignedToName: null, convertedMemberId: null, createdAt: iso(-6 * DAY) },
];

export const LOW_STOCK = [
  { id: 'p1', name: 'Eau minérale 1,5 L', sku: null, category: 'DRINK', price: 1.2, cost: 0.6, stock: 4, lowStockThreshold: 12, isActive: true, imageUrl: null, isLowStock: true },
];

export const MAINTENANCE_DUE = [
  { id: 'e1', name: 'Tapis de course n°3', category: 'CARDIO', brand: 'Technogym', model: null, serialNumber: null, roomId: 'r1', roomName: 'Salle Cardio', purchaseDate: null, purchasePrice: null, warrantyUntil: null, status: 'OPERATIONAL', maintenanceIntervalDays: 90, lastMaintenanceAt: dateOnly(-85), nextMaintenanceAt: dateOnly(5), notes: null },
];
