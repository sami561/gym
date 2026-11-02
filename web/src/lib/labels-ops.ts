import type {
  ContractType,
  EmployeePosition,
  EquipmentCategory,
  EquipmentStatus,
  ExpenseCategory,
  LeadActivityType,
  LeadSource,
  LeadStatus,
  LeaveStatus,
  LeaveType,
  LockerStatus,
  MuscleGroup,
  ProductCategory,
  PromoType,
  PtSessionStatus,
  SalaryType,
  StockMovementType,
  TaskStatus,
  TaskType,
  TicketPriority,
  TicketStatus,
  WorkflowRunStatus,
  WorkflowTriggerType,
} from '../api/types-ops';
import type { RoomType } from '../api/types';
import type { BadgeTone } from '../components/ui/Badge';
import type { MessageKey } from '../i18n/messages';

export const POSITION_LABELS: Record<EmployeePosition, MessageKey> = {
  MANAGER: 'Gérant',
  RECEPTION: 'Accueil',
  COACH: 'Coach',
  CLEANING: 'Entretien',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Autre',
};

export const CONTRACT_LABELS: Record<ContractType, MessageKey> = {
  CDI: 'CDI',
  CDD: 'CDD',
  FREELANCE: 'Freelance',
  STAGE: 'Stage',
};

export const SALARY_TYPE_LABELS: Record<SalaryType, MessageKey> = {
  MONTHLY: 'Mensuel',
  HOURLY: 'À l’heure',
  PER_SESSION: 'À la séance',
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, MessageKey> = {
  ANNUAL: 'Congé annuel',
  SICK: 'Maladie',
  UNPAID: 'Sans solde',
  OTHER: 'Autre',
};

export const LEAVE_STATUS: Record<LeaveStatus, { label: MessageKey; tone: BadgeTone }> = {
  PENDING: { label: 'En attente', tone: 'warn' },
  APPROVED: { label: 'Accepté', tone: 'good' },
  REJECTED: { label: 'Refusé', tone: 'bad' },
};

export const ROOM_TYPE_LABELS: Record<RoomType, MessageKey> = {
  MUSCULATION: 'Musculation',
  CARDIO: 'Cardio',
  COURS_COLLECTIFS: 'Cours collectifs',
  CROSSFIT: 'Cross training',
  VESTIAIRE: 'Vestiaire',
  ACCUEIL: 'Accueil',
  AUTRE: 'Autre',
};

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, MessageKey> = {
  CARDIO: 'Cardio',
  STRENGTH: 'Machine guidée',
  FREE_WEIGHTS: 'Poids libres',
  ACCESSORY: 'Accessoire',
  OTHER: 'Autre',
};

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: MessageKey; tone: BadgeTone }> = {
  OPERATIONAL: { label: 'En service', tone: 'good' },
  MAINTENANCE: { label: 'En maintenance', tone: 'warn' },
  OUT_OF_ORDER: { label: 'En panne', tone: 'bad' },
  RETIRED: { label: 'Retiré', tone: 'neutral' },
};

export const TICKET_PRIORITY: Record<TicketPriority, { label: MessageKey; tone: BadgeTone }> = {
  LOW: { label: 'Basse', tone: 'neutral' },
  MEDIUM: { label: 'Moyenne', tone: 'info' },
  HIGH: { label: 'Haute', tone: 'warn' },
  URGENT: { label: 'Urgente', tone: 'bad' },
};

export const TICKET_STATUS: Record<TicketStatus, { label: MessageKey; tone: BadgeTone }> = {
  OPEN: { label: 'Ouvert', tone: 'warn' },
  IN_PROGRESS: { label: 'En cours', tone: 'info' },
  RESOLVED: { label: 'Résolu', tone: 'good' },
};

export const LOCKER_STATUS_LABELS: Record<LockerStatus, MessageKey> = {
  FREE: 'Libre',
  OCCUPIED: 'Occupé',
  OUT_OF_ORDER: 'Hors service',
};

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, MessageKey> = {
  SUPPLEMENT: 'Compléments',
  DRINK: 'Boissons',
  SNACK: 'Snacks',
  APPAREL: 'Textile',
  ACCESSORY: 'Accessoires',
  SERVICE: 'Services',
};

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, MessageKey> = {
  IN: 'Entrée',
  OUT: 'Sortie',
  ADJUSTMENT: 'Inventaire',
  SALE: 'Vente',
  RETURN: 'Retour',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, MessageKey> = {
  RENT: 'Loyer',
  SALARY: 'Salaires',
  UTILITIES: 'Eau, électricité, internet',
  MAINTENANCE: 'Maintenance',
  EQUIPMENT: 'Équipement',
  MARKETING: 'Marketing',
  SUPPLIES: 'Fournitures',
  TAXES: 'Impôts et taxes',
  OTHER: 'Autre',
};

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, MessageKey> = {
  CHEST: 'Pectoraux',
  BACK: 'Dos',
  SHOULDERS: 'Épaules',
  ARMS: 'Bras',
  LEGS: 'Jambes',
  GLUTES: 'Fessiers',
  CORE: 'Gainage',
  CARDIO: 'Cardio',
  FULL_BODY: 'Full body',
};

export const PT_STATUS: Record<PtSessionStatus, { label: MessageKey; tone: BadgeTone }> = {
  SCHEDULED: { label: 'Prévue', tone: 'info' },
  DONE: { label: 'Faite', tone: 'good' },
  CANCELLED: { label: 'Annulée', tone: 'neutral' },
  NO_SHOW: { label: 'Absent', tone: 'bad' },
};

export const PROMO_TYPE_LABELS: Record<PromoType, MessageKey> = {
  PERCENT: 'Pourcentage',
  FIXED: 'Montant fixe',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, MessageKey> = {
  WALK_IN: 'Passage en salle',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  WEBSITE: 'Site web',
  REFERRAL: 'Parrainage',
  PHONE: 'Téléphone',
  OTHER: 'Autre',
};

export const LEAD_STATUS: Record<LeadStatus, { label: MessageKey; tone: BadgeTone }> = {
  NEW: { label: 'Nouveau', tone: 'info' },
  CONTACTED: { label: 'Contacté', tone: 'neutral' },
  TRIAL: { label: 'Essai prévu', tone: 'warn' },
  CONVERTED: { label: 'Inscrit', tone: 'good' },
  LOST: { label: 'Perdu', tone: 'bad' },
};

export const LEAD_ACTIVITY_LABELS: Record<LeadActivityType, MessageKey> = {
  CALL: 'Appel',
  MESSAGE: 'Message',
  EMAIL: 'E-mail',
  VISIT: 'Visite',
  NOTE: 'Note',
};

export const TASK_STATUS: Record<TaskStatus, { label: MessageKey; tone: BadgeTone }> = {
  BLOCKED: { label: 'Bloquée', tone: 'neutral' },
  TODO: { label: 'À faire', tone: 'info' },
  IN_PROGRESS: { label: 'En cours', tone: 'warn' },
  DONE: { label: 'Terminée', tone: 'good' },
  SKIPPED: { label: 'Ignorée', tone: 'neutral' },
  FAILED: { label: 'En échec', tone: 'bad' },
};

export const TASK_TYPE_LABELS: Record<TaskType, MessageKey> = {
  MANUAL: 'Manuelle',
  AUTOMATION: 'Automatique',
};

export const RUN_STATUS: Record<WorkflowRunStatus, { label: MessageKey; tone: BadgeTone }> = {
  RUNNING: { label: 'En cours', tone: 'info' },
  COMPLETED: { label: 'Terminé', tone: 'good' },
  CANCELLED: { label: 'Annulé', tone: 'neutral' },
};

export const TRIGGER_TYPE_LABELS: Record<WorkflowTriggerType, MessageKey> = {
  MANUAL: 'Manuel',
  EVENT: 'Événement',
  SCHEDULE: 'Planifié',
};

/** French labels for TRIGGERABLE_EVENTS (workflow.contracts.ts). */
export const EVENT_LABELS: Record<string, MessageKey> = {
  'member.created': 'Nouveau membre inscrit',
  'subscription.created': 'Abonnement souscrit',
  'subscription.expiring': 'Abonnement bientôt expiré',
  'subscription.expired': 'Abonnement expiré',
  'payment.received': 'Paiement reçu',
  'booking.created': 'Réservation de cours',
  'lead.created': 'Nouveau prospect',
  'sale.completed': 'Vente en boutique',
  'stock.low': 'Stock bas',
  'maintenance.opened': 'Panne signalée',
};

export const CRON_PRESETS: { cron: string; label: MessageKey }[] = [
  { cron: '45 5 * * *', label: 'Chaque jour à 5h45' },
  { cron: '0 8 * * *', label: 'Chaque jour à 8h00' },
  { cron: '0 22 * * *', label: 'Chaque soir à 22h00' },
  { cron: '45 5 * * 1-6', label: 'Du lundi au samedi à 5h45' },
  { cron: '0 9 * * 1', label: 'Chaque lundi à 9h00' },
  { cron: '0 9 1 * *', label: 'Le 1er du mois à 9h00' },
];

export function cronLabel(cron: string | null | undefined, t: (key: MessageKey, vars?: Record<string, string>) => string): string {
  if (!cron) return '—';
  const preset = CRON_PRESETS.find((p) => p.cron === cron);
  return preset ? t(preset.label) : t('Cron « {cron} »', { cron });
}
