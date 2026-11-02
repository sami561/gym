import {
  BadgePercent,
  Building2,
  CalendarClock,
  CalendarDays,
  Gauge,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  DoorOpen,
  Dumbbell,
  LayoutDashboard,
  ScanLine,
  ShoppingBag,
  Tags,
  UserCog,
  UserPlus,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../api/types';
import type { MessageKey } from '../i18n/messages';

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  roles: Role[];
}

export interface NavSection {
  title: MessageKey | null;
  items: NavItem[];
}

const ALL: Role[] = ['ADMIN', 'STAFF', 'COACH'];
const DESK: Role[] = ['ADMIN', 'STAFF'];
const ADMIN: Role[] = ['ADMIN'];

export const NAV: NavSection[] = [
  { title: null, items: [{ to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, roles: DESK }] },
  {
    title: 'Membres',
    items: [
      { to: '/admin/membres', label: 'Membres', icon: Users, roles: DESK },
      { to: '/admin/prospects', label: 'Prospects', icon: UserPlus, roles: DESK },
    ],
  },
  {
    title: 'Activité',
    items: [
      { to: '/admin/planning', label: 'Planning des cours', icon: CalendarDays, roles: ALL },
      { to: '/admin/entrainement', label: 'Entraînement', icon: Dumbbell, roles: ALL },
      { to: '/admin/acces', label: 'Portes et accès', icon: DoorOpen, roles: DESK },
      { to: '/admin/scanner', label: 'Scanner QR', icon: ScanLine, roles: DESK },
    ],
  },
  {
    title: 'Organisation',
    items: [
      { to: '/admin/taches', label: 'Tâches', icon: ClipboardList, roles: ALL },
      { to: '/admin/workflows', label: 'Workflows', icon: Workflow, roles: DESK },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { to: '/admin/boutique', label: 'Boutique', icon: ShoppingBag, roles: DESK },
      { to: '/admin/salles', label: 'Salles et équipements', icon: Wrench, roles: DESK },
      { to: '/admin/rh', label: 'Employés', icon: Building2, roles: DESK },
      { to: '/admin/calendrier-equipe', label: 'Calendrier de l’équipe', icon: CalendarClock, roles: DESK },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/admin/performance', label: 'Performance', icon: Gauge, roles: ADMIN },
      { to: '/admin/paiements', label: 'Paiements', icon: CreditCard, roles: DESK },
      { to: '/admin/finance', label: 'Dépenses et résultats', icon: ChartNoAxesCombined, roles: ADMIN },
      { to: '/admin/promos', label: 'Codes promo', icon: BadgePercent, roles: ADMIN },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin/offres', label: 'Offres et tarifs', icon: Tags, roles: DESK },
      { to: '/admin/equipe', label: 'Comptes équipe', icon: UserCog, roles: ADMIN },
    ],
  },
];

export function navFor(role: Role): NavSection[] {
  return NAV.map((section) => ({ ...section, items: section.items.filter((item) => item.roles.includes(role)) })).filter(
    (section) => section.items.length > 0,
  );
}

/** First page a role may open (coaches have no dashboard). */
export function homeFor(role: Role): string {
  return role === 'COACH' ? '/admin/planning' : '/admin';
}
