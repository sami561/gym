import { useEffect, useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { usersApi } from '../../api/endpoints';
import type { CreateUserRequest, Role, UserDto } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { ErrorNote } from '../../components/ui/Card';
import { FormFields, fromFormValues, type FieldDef, type FormValues } from '../../components/ui/FormModal';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useI18n } from '../../i18n';
import { ROLE_LABELS } from '../../lib/format';
import { PhotoPicker, type PhotoDraft } from '../photos/PhotoPicker';
import { photoErrorText } from '../photos/photos';

const ROLE_OPTIONS = (['ADMIN', 'STAFF', 'COACH'] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

function accountFields(isNew: boolean): FieldDef[] {
  return [
    { name: 'firstName', label: 'Prénom', required: true },
    { name: 'lastName', label: 'Nom de famille', required: true },
    { name: 'email', label: 'E-mail de connexion', type: 'email', required: true },
    { name: 'phone', label: 'Téléphone', type: 'tel' },
    { name: 'role', label: 'Rôle', type: 'select', required: true, options: ROLE_OPTIONS },
    {
      name: 'password',
      label: isNew ? 'Mot de passe' : 'Nouveau mot de passe',
      type: 'password',
      required: isNew,
      hint: isNew ? '8 caractères minimum.' : 'Laisser vide pour le conserver.',
    },
    ...(isNew ? [] : ([{ name: 'isActive', label: 'Compte actif', type: 'checkbox' }] satisfies FieldDef[])),
  ];
}

/** Shown on the website next to the coach's photo. */
const COACH_FIELDS: FieldDef[] = [
  { name: 'specialty', label: 'Spécialité', wide: true },
  { name: 'bio', label: 'Présentation affichée sur le site', type: 'textarea' },
];

function initialValues(account: UserDto | null): FormValues {
  return {
    firstName: account?.firstName ?? '',
    lastName: account?.lastName ?? '',
    email: account?.email ?? '',
    phone: account?.phone ?? '',
    role: account?.role ?? 'STAFF',
    password: '',
    specialty: account?.specialty ?? '',
    bio: account?.bio ?? '',
    isActive: account?.isActive ?? true,
  };
}

interface TeamAccountModalProps {
  open: boolean;
  /** The account to edit, null for a new one. */
  account: UserDto | null;
  onClose: () => void;
}

/**
 * Create or edit a back-office account. A coach also gets their website profile: photo (taken or
 * imported, uploaded once the account is saved), speciality and bio.
 */
export function TeamAccountModal({ open, account, onClose }: TeamAccountModalProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const formId = useId();
  // The account being edited, null while it does not exist yet. A new account whose photo failed
  // becomes this account: the dialog stays open and "Enregistrer" tries the photo again.
  const [target, setTarget] = useState<UserDto | null>(account);
  const [values, setValues] = useState<FormValues>(() => initialValues(account));
  const [photo, setPhoto] = useState<PhotoDraft>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const coach = values.role === 'COACH';

  useEffect(() => {
    if (!open) return;
    setTarget(account);
    setValues(initialValues(account));
    setPhoto(null);
    setError(null);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: string, value: string | boolean) => setValues((previous) => ({ ...previous, [name]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (preparing) return;
    const isNew = target === null;
    const body = fromFormValues([...accountFields(isNew), ...(coach ? COACH_FIELDS : [])], values);
    if (!body.password) delete body.password;
    setSaving(true);
    setError(null);

    let saved: UserDto;
    try {
      saved = target ? await usersApi.update(target.id, body) : await usersApi.create(body as unknown as CreateUserRequest);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ['users'] });

    // Only coaches have a photo (the website shows it); it needs the saved account.
    if (coach && photo !== null) {
      try {
        saved = photo === 'remove' ? await usersApi.removePhoto(saved.id) : await usersApi.setPhoto(saved.id, photo);
        void queryClient.invalidateQueries({ queryKey: ['users'] });
      } catch (err) {
        const reason = photoErrorText(err, t);
        setTarget(saved);
        setValues((previous) => ({ ...previous, password: '', isActive: saved.isActive }));
        if (isNew) setError(t('Compte créé, mais la photo n’a pas été enregistrée : {error} Enregistrez à nouveau pour réessayer.', { error: reason }));
        else if (photo === 'remove') setError(t('Compte enregistré, mais la photo n’a pas été supprimée : {error} Enregistrez à nouveau pour réessayer.', { error: reason }));
        else setError(t('Compte enregistré, mais la photo n’a pas été enregistrée : {error} Enregistrez à nouveau pour réessayer.', { error: reason }));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(t('Compte enregistré.'));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target ? t('Modifier le compte') : t('Nouveau compte')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button type="submit" form={formId} loading={saving} disabled={preparing}>
            {target ? t('Enregistrer') : t('Créer le compte')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
        <FormFields fields={accountFields(target === null)} values={values} onChange={set} />
        {coach && (
          <fieldset className="rounded-xl bg-page p-4 ring-1 ring-line">
            <legend className="px-1 text-sm font-semibold text-fg">{t('Profil sur le site')}</legend>
            <div className="flex flex-col gap-4">
              <PhotoPicker
                draft={photo}
                onChange={setPhoto}
                currentUrl={target?.avatarUrl ?? null}
                name={`${values.firstName} ${values.lastName}`}
                hint={t('Photo publique : tout le monde la voit sur le site, avec la spécialité et la présentation.')}
                disabled={saving}
                onPreparingChange={setPreparing}
              />
              <FormFields fields={COACH_FIELDS} values={values} onChange={set} />
            </div>
          </fieldset>
        )}
        {error && <ErrorNote message={error} />}
      </form>
    </Modal>
  );
}
