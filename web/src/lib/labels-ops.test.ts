import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { translate, type Lang } from '../i18n';
import { registerMessages, type MessageKey } from '../i18n/messages';
import { admin } from '../i18n/messages/admin';
import {
  ACCESS_METHOD_LABELS,
  BOOKING_STATUS_LABELS,
  DOOR_DRIVER_LABELS,
  MEMBER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  ROLE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from './format';
import * as ops from './labels-ops';

type LabelMap = Record<string, MessageKey | { label: MessageKey }>;

/** Every label map, with the backend enum (backend/libs/common/src/contracts) it describes. */
const LABEL_MAPS: [enumName: string, labels: LabelMap][] = [
  ['Role', ROLE_LABELS],
  ['PaymentMethod', PAYMENT_METHOD_LABELS],
  ['SubscriptionStatus', SUBSCRIPTION_STATUS_LABELS],
  ['MemberStatus', MEMBER_STATUS_LABELS],
  ['BookingStatus', BOOKING_STATUS_LABELS],
  ['AccessMethod', ACCESS_METHOD_LABELS],
  ['DoorDriver', DOOR_DRIVER_LABELS],
  ['EmployeePosition', ops.POSITION_LABELS],
  ['ContractType', ops.CONTRACT_LABELS],
  ['SalaryType', ops.SALARY_TYPE_LABELS],
  ['LeaveType', ops.LEAVE_TYPE_LABELS],
  ['LeaveStatus', ops.LEAVE_STATUS],
  ['RoomType', ops.ROOM_TYPE_LABELS],
  ['EquipmentCategory', ops.EQUIPMENT_CATEGORY_LABELS],
  ['EquipmentStatus', ops.EQUIPMENT_STATUS],
  ['TicketPriority', ops.TICKET_PRIORITY],
  ['TicketStatus', ops.TICKET_STATUS],
  ['LockerStatus', ops.LOCKER_STATUS_LABELS],
  ['ProductCategory', ops.PRODUCT_CATEGORY_LABELS],
  ['StockMovementType', ops.STOCK_MOVEMENT_LABELS],
  ['ExpenseCategory', ops.EXPENSE_CATEGORY_LABELS],
  ['MuscleGroup', ops.MUSCLE_GROUP_LABELS],
  ['PtSessionStatus', ops.PT_STATUS],
  ['PromoType', ops.PROMO_TYPE_LABELS],
  ['LeadSource', ops.LEAD_SOURCE_LABELS],
  ['LeadStatus', ops.LEAD_STATUS],
  ['LeadActivityType', ops.LEAD_ACTIVITY_LABELS],
  ['TaskStatus', ops.TASK_STATUS],
  ['TaskType', ops.TASK_TYPE_LABELS],
  ['WorkflowRunStatus', ops.RUN_STATUS],
  ['WorkflowTriggerType', ops.TRIGGER_TYPE_LABELS],
];

const LANGS: Lang[] = ['fr', 'en', 'ar'];
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const labelOf = (entry: MessageKey | { label: MessageKey }) => (typeof entry === 'string' ? entry : entry.label);
const texts = (labels: LabelMap, lang: Lang) => Object.values(labels).map((entry) => translate(lang, labelOf(entry)));

beforeAll(() => registerMessages(admin));

const CONTRACTS = new URL('../../../backend/libs/common/src/contracts/', import.meta.url);

/** Values of each `export enum` in the backend contracts, and the TRIGGERABLE_EVENTS list. */
function readContracts() {
  const enums = new Map<string, string[]>();
  let events: string[] = [];
  for (const file of readdirSync(CONTRACTS).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, CONTRACTS), 'utf8');
    for (const [, name, body] of source.matchAll(/export enum (\w+)\s*\{([^}]*)\}/g)) {
      enums.set(name, [...body.matchAll(/=\s*'([^']+)'/g)].map((match) => match[1]));
    }
    const list = /export const TRIGGERABLE_EVENTS = \[([^\]]*)\]/.exec(source);
    if (list) events = [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  }
  return { enums, events };
}

// The web types mirror the contracts by hand (web/CLAUDE.md): a value added on one side shows up here.
// Skipped only when web/ is checked out without the backend.
describe.skipIf(!existsSync(CONTRACTS))('labels cover the backend enums', () => {
  const contracts = existsSync(CONTRACTS) ? readContracts() : { enums: new Map<string, string[]>(), events: [] };

  it.each(LABEL_MAPS)('%s has exactly one label per value', (enumName, labels) => {
    expect(contracts.enums.has(enumName), `enum ${enumName} not found in the contracts`).toBe(true);
    expect(Object.keys(labels).sort()).toEqual([...(contracts.enums.get(enumName) ?? [])].sort());
  });

  it('EVENT_LABELS names every event a workflow can start on', () => {
    expect(contracts.events.length).toBeGreaterThan(0);
    expect(Object.keys(ops.EVENT_LABELS).sort()).toEqual([...contracts.events].sort());
  });
});

describe('label translations', () => {
  it.each(LABEL_MAPS)('%s is translated, in Arabic script for Arabic', (_, labels) => {
    for (const entry of Object.values(labels)) {
      const key = labelOf(entry);
      expect(translate('en', key).trim(), key).not.toBe('');
      // D17 is the name of the Tunisian payment wallet.
      if (key !== 'D17') expect(translate('ar', key), key).toMatch(ARABIC_SCRIPT);
    }
  });

  it.each(LABEL_MAPS)('%s never gives two values the same label, in any language', (_, labels) => {
    for (const lang of LANGS) {
      const shown = texts(labels, lang);
      expect(new Set(shown).size, `${lang}: ${shown.join(' / ')}`).toBe(shown.length);
    }
  });

  it('translates every workflow event', () => {
    for (const lang of LANGS) {
      const shown = Object.values(ops.EVENT_LABELS).map((key) => translate(lang, key));
      expect(new Set(shown).size).toBe(shown.length);
      if (lang === 'ar') shown.forEach((text) => expect(text).toMatch(ARABIC_SCRIPT));
    }
  });
});

describe('cronLabel', () => {
  const t = (lang: Lang) => (key: MessageKey, vars?: Record<string, string>) => translate(lang, key, vars);

  it('names a preset schedule in the UI language', () => {
    expect(ops.cronLabel('45 5 * * 1-6', t('fr'))).toBe('Du lundi au samedi à 5h45');
    expect(ops.cronLabel('45 5 * * 1-6', t('en'))).toBe('Monday to Saturday at 5:45');
    expect(ops.cronLabel('0 9 * * 1', t('ar'))).toBe('كل إثنين على الساعة 9:00');
  });

  it('shows any other expression as raw cron', () => {
    expect(ops.cronLabel('*/15 6-22 * * *', t('fr'))).toBe('Cron « */15 6-22 * * * »');
    expect(ops.cronLabel('*/15 6-22 * * *', t('en'))).toBe('Cron “*/15 6-22 * * *”');
  });

  it('shows a dash when there is no schedule', () => {
    expect(ops.cronLabel(null, t('fr'))).toBe('—');
    expect(ops.cronLabel(undefined, t('fr'))).toBe('—');
    expect(ops.cronLabel('', t('fr'))).toBe('—');
  });

  it('offers distinct five-field presets whose label states the time they run at', () => {
    const crons = ops.CRON_PRESETS.map((preset) => preset.cron);
    expect(new Set(crons).size).toBe(crons.length);
    for (const { cron, label } of ops.CRON_PRESETS) {
      expect(cron).toMatch(/^([\d*,/-]+ ){4}[\d*,/-]+$/);
      const [minute, hour] = cron.split(' ');
      expect(label).toContain(`${hour}h${minute.padStart(2, '0')}`);
    }
  });
});
