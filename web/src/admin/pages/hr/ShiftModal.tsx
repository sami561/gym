import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { shiftsApi } from '../../../api/endpoints-ops';
import { errorMessage } from '../../../api/client';
import type { EmployeeDto, ShiftDto } from '../../../api/types-ops';
import { Button } from '../../../components/ui/Button';
import { ErrorNote } from '../../../components/ui/Card';
import { Input, Select } from '../../../components/ui/Field';
import { Modal, useConfirm } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { formatTime, fullName, isoDay } from '../../../lib/format';
import { useI18n } from '../../../i18n';

export type ShiftDraft = { shift: ShiftDto } | { employeeId?: string; date: string; startHour?: number };

function at(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

/** Create / edit / delete one shift (team calendar and HR). */
export function ShiftModal({ draft, employees, onClose }: { draft: ShiftDraft | null; employees: EmployeeDto[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const existing = draft && 'shift' in draft ? draft.shift : null;
  const [form, setForm] = useState({ employeeId: '', date: '', start: '08:00', end: '14:00', task: '', roomName: '', repeatWeeks: '0' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setError(null);
    if ('shift' in draft) {
      const s = draft.shift;
      setForm({
        employeeId: s.employeeId,
        date: isoDay(new Date(s.startsAt)),
        start: formatTime(s.startsAt),
        end: formatTime(s.endsAt),
        task: s.task ?? '',
        roomName: s.roomName ?? '',
        repeatWeeks: '0',
      });
    } else {
      const start = draft.startHour ?? 8;
      setForm({
        employeeId: draft.employeeId ?? '',
        date: draft.date,
        start: `${String(start).padStart(2, '0')}:00`,
        end: `${String(Math.min(23, start + 6)).padStart(2, '0')}:00`,
        task: '',
        roomName: '',
        repeatWeeks: '0',
      });
    }
  }, [draft]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['shifts'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'team'] });
  };

  const save = async () => {
    if (form.end <= form.start) {
      setError(t('L’heure de fin doit être après l’heure de début.'));
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      employeeId: form.employeeId,
      startsAt: at(form.date, form.start),
      endsAt: at(form.date, form.end),
      task: form.task.trim() || null,
      roomName: form.roomName.trim() || null,
    };
    try {
      if (existing) await shiftsApi.update(existing.id, body);
      else await shiftsApi.create({ ...body, repeatWeeks: Number(form.repeatWeeks) || 0 });
      toast.success(existing ? t('Créneau modifié.') : t('Créneau ajouté.'));
      refresh();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(draft)}
      onClose={onClose}
      title={existing ? t('Modifier le créneau') : t('Nouveau créneau')}
      size="md"
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (!(await confirm({ title: t('Supprimer ce créneau ?'), confirmLabel: t('Supprimer'), danger: true }))) return;
                try {
                  await shiftsApi.remove(existing.id);
                  refresh();
                  onClose();
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              {t('Supprimer')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button loading={saving} disabled={!form.employeeId || !form.date} onClick={() => void save()}>
            {t('Enregistrer')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={t('Employé')} value={form.employeeId} onChange={set('employeeId')} wrapperClassName="sm:col-span-2">
          <option value="">{t('Choisir…')}</option>
          {employees
            .filter((e) => e.status === 'ACTIVE')
            .map((e) => (
              <option key={e.id} value={e.id}>
                {fullName(e)}
              </option>
            ))}
        </Select>
        <Input label={t('Jour')} type="date" value={form.date} onChange={set('date')} wrapperClassName="sm:col-span-2" />
        <Input label={t('Début')} type="time" value={form.start} onChange={set('start')} />
        <Input label={t('Fin')} type="time" value={form.end} onChange={set('end')} />
        <Input label={t('Tâche')} placeholder={t('Accueil, ménage, cours…')} value={form.task} onChange={set('task')} />
        <Input label={t('Salle')} placeholder={t('Plateau, studio…')} value={form.roomName} onChange={set('roomName')} />
        {!existing && (
 <Input label={t('Répéter chaque semaine pendant (semaines)')} type="number" min={0} max={12} value={form.repeatWeeks} onChange={set('repeatWeeks')} wrapperClassName="sm:col-span-2" />
        )}
        {error && (
          <div className="sm:col-span-2">
            <ErrorNote message={error} />
          </div>
        )}
      </div>
    </Modal>
  );
}
