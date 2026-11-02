import type { GymInfo, PlanDto } from '../api/types';

/**
 * Shown while the API is unreachable. Mirrors the backend defaults (gym.config.ts);
 * phone and opening hours must be confirmed with the gym.
 */
export const FALLBACK_GYM: GymInfo = {
  name: 'Meliora Gym',
  tagline: 'Forge ta meilleure version',
  address: 'Khzema Est, Rue Colonel Garnaoui',
  city: 'Sousse 4051, Tunisie',
  phone: '',
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

/** Plan shapes without prices: prices are never invented, the page says "tarif en salle". */
export type FallbackPlan = Omit<PlanDto, 'price'> & { price: number | null };

export const FALLBACK_PLANS: FallbackPlan[] = [
  {
    id: 'fallback-month',
    name: 'Mensuel',
    description: 'Accès illimité pendant 1 mois.',
    durationDays: 30,
    price: null,
    features: ['Accès illimité musculation & cardio', 'Accès par QR code', 'Vestiaires'],
    isFeatured: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'fallback-quarter',
    name: 'Trimestriel',
    description: 'Le bon rythme pour voir les résultats.',
    durationDays: 90,
    price: null,
    features: ['Tout le mensuel', 'Cours collectifs inclus', 'Bilan de départ avec un coach'],
    isFeatured: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'fallback-year',
    name: 'Annuel',
    description: "L'engagement des athlètes.",
    durationDays: 365,
    price: null,
    features: ['Tout le trimestriel', 'Suivi de progression', 'Meilleur prix au mois'],
    isFeatured: false,
    isActive: true,
    sortOrder: 3,
  },
];

export const MAPS_EMBED_URL =
  'https://www.google.com/maps?q=' +
  encodeURIComponent('Meliora Gym, Rue Colonel Garnaoui, Sousse') +
  '&output=embed';
