import { env, envFloat, envInt } from './env';

export interface OpeningHours {
  days: string;
  open: string;
  close: string;
}

export interface GymInfo {
  name: string;
  tagline: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  mapsUrl: string;
  location: { lat: number; lng: number };
  geofenceMeters: number;
  openingHours: OpeningHours[];
}

/** Public gym details. Phone, hours and exact GPS point must be confirmed with the gym. */
export function gymInfo(): GymInfo {
  return {
    name: env('GYM_NAME', 'Meliora Gym'),
    tagline: env('GYM_TAGLINE', 'Forge ta meilleure version'),
    address: env('GYM_ADDRESS', 'Khzema Est, Rue Colonel Garnaoui'),
    city: env('GYM_CITY', 'Sousse 4051, Tunisie'),
    phone: env('GYM_PHONE', '+216 00 000 000'),
    email: env('GYM_EMAIL', 'contact@meliora-gym.tn'),
    instagram: env('GYM_INSTAGRAM', 'https://www.instagram.com/gymmeliora/'),
    facebook: env('GYM_FACEBOOK', 'https://www.facebook.com/p/Meliora-Gym-61589769249533/'),
    mapsUrl: env('GYM_MAPS_URL', 'https://maps.app.goo.gl/CVWB98nx2RdSd8Mw8'),
    location: { lat: envFloat('GYM_LAT', 35.8456), lng: envFloat('GYM_LNG', 10.6178) },
    geofenceMeters: envInt('GEOFENCE_METERS', 150),
    openingHours: parseHours(
      env('GYM_OPENING_HOURS', 'Lun – Sam|06:00|22:00;Dimanche|08:00|14:00'),
    ),
  };
}

function parseHours(raw: string): OpeningHours[] {
  return raw
    .split(';')
    .map((chunk) => chunk.split('|').map((part) => part.trim()))
    .filter((parts) => parts.length === 3)
    .map(([days, open, close]) => ({ days, open, close }));
}
