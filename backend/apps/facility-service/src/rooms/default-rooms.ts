import { CreateRoomRequest, RoomType } from '@app/common';

/** Seeded on first boot (empty rooms table); staff can edit or deactivate them. */
export const DEFAULT_ROOMS: CreateRoomRequest[] = [
  {
    name: 'Plateau musculation',
    type: RoomType.MUSCULATION,
    capacity: 60,
    description: 'Machines guidées, racks et poids libres.',
  },
  {
    name: 'Espace cardio',
    type: RoomType.CARDIO,
    capacity: 30,
    description: 'Tapis de course, vélos, elliptiques et rameurs.',
  },
  {
    name: 'Salle cours collectifs',
    type: RoomType.COURS_COLLECTIFS,
    capacity: 25,
    description: 'Cours encadrés par les coachs.',
  },
  {
    name: 'Zone cross-training',
    type: RoomType.CROSSFIT,
    capacity: 20,
    description: 'Espace fonctionnel pour le circuit training.',
  },
  { name: 'Vestiaire Hommes', type: RoomType.VESTIAIRE, capacity: 40, description: 'Vestiaire et casiers.' },
  { name: 'Vestiaire Femmes', type: RoomType.VESTIAIRE, capacity: 30, description: 'Vestiaire et casiers.' },
  { name: 'Accueil', type: RoomType.ACCUEIL, capacity: 10, description: 'Accueil et inscriptions.' },
];
