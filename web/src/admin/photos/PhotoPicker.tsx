import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { Camera, ImageUp, RotateCcw, Trash2, UserRound } from 'lucide-react';
import { apiFileUrl } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { useI18n } from '../../i18n';
import { initials } from '../../lib/format';
import { preparePhoto } from '../../lib/photo';
import { CameraModal } from './CameraModal';
import { AVATAR_SIZES, AVATAR_TONES, photoErrorText, useObjectUrl } from './photos';

/**
 * A photo change waiting in a form, saved with it: a new photo (prepared JPEG), 'remove' to delete
 * the saved one, or null (unchanged).
 */
export type PhotoDraft = Blob | 'remove' | null;

interface PhotoPickerProps {
  draft: PhotoDraft;
  onChange: (draft: PhotoDraft) => void;
  /** The saved photo (a coach's public avatarUrl), null without one. */
  currentUrl?: string | null;
  /** Full name typed so far: initials and alternative text. */
  name: string;
  /** Who sees the photo once saved. */
  hint: string;
  /** The form is saving: nothing can change. */
  disabled?: boolean;
  /** A picked file is being prepared (decode, crop, resize): the form waits for it before saving. */
  onPreparingChange?: (preparing: boolean) => void;
}

/**
 * Photo step of the new member and team account forms: take one with the webcam or import a file,
 * see it, remove or replace it before saving. Nothing is uploaded here; the form saves the draft
 * after the account exists.
 */
export function PhotoPicker({ draft, onChange, currentUrl = null, name, hint, disabled = false, onPreparingChange }: PhotoPickerProps) {
  const { t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const [camera, setCamera] = useState(false);
  // Stable: CameraModal's own close handler (and its Escape guard while saving) depends on it.
  const closeCamera = useCallback(() => setCamera(false), []);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftUrl = useObjectUrl(draft instanceof Blob ? draft : null);
  const savedUrl = currentUrl ? apiFileUrl(currentUrl) : null;
  // An address that does not load (typed by hand long ago) shows the initials.
  const [broken, setBroken] = useState<string | null>(null);

  // The new photo, else the saved one unless it is to be deleted.
  const src = draft instanceof Blob ? draftUrl : draft === 'remove' ? null : savedUrl;
  const shown = src !== null && src !== broken;
  const label = name.trim();
  const busy = disabled || preparing;
  // A new photo can be dropped, a saved one deleted (even an old address that no longer loads).
  const removable = draft instanceof Blob || (draft === null && savedUrl !== null);

  let status: string;
  if (draft instanceof Blob) status = t('Nouvelle photo, pas encore enregistrée.');
  else if (draft === 'remove') status = t('La photo sera supprimée à l’enregistrement.');
  else if (savedUrl) status = t('Photo actuelle.');
  else status = t('Aucune photo.');

  const choose = (next: PhotoDraft) => {
    setError(null);
    onChange(next);
  };

  // The button clicked disappears: the keyboard focus goes to the first photo action.
  const chooseAndRefocus = (next: PhotoDraft) => {
    choose(next);
    importButton.current?.focus();
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    onPreparingChange?.(true);
    setError(null);
    try {
      onChange(await preparePhoto(file));
    } catch (reason) {
      setError(photoErrorText(reason, t));
    } finally {
      setPreparing(false);
      onPreparingChange?.(false);
    }
  };

  return (
    <div className="flex items-start gap-4 sm:gap-5">
      <span className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden select-none', AVATAR_SIZES.lg, AVATAR_TONES.plain)}>
        {shown ? (
          <img
            src={src}
            alt={label ? t('Photo de {name}', { name: label }) : t('Aperçu de la photo')}
            decoding="async"
            draggable={false}
            onError={() => setBroken(src)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : label ? (
          <span className="type-wide leading-none" aria-hidden>
            {initials(label)}
          </span>
        ) : (
          <UserRound className="size-8 text-muted" aria-hidden />
        )}
        {preparing && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white" role="status" aria-label={t('Préparation de la photo…')}>
            <Spinner className="size-6" />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div>
          <p className="text-sm font-medium text-fg" aria-live="polite">
            {status}
          </p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button ref={importButton} size="sm" variant="secondary" icon={<ImageUp className="size-3.5" />} disabled={busy} onClick={() => fileInput.current?.click()}>
            {t('Importer une photo')}
          </Button>
          <Button size="sm" variant="secondary" icon={<Camera className="size-3.5" />} disabled={busy} onClick={() => setCamera(true)}>
            {t('Prendre une photo')}
          </Button>
          {removable && (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} disabled={busy} onClick={() => chooseAndRefocus(savedUrl ? 'remove' : null)}>
              {t('Retirer la photo')}
            </Button>
          )}
          {draft !== null && savedUrl && (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5 rtl:-scale-x-100" />} disabled={busy} onClick={() => chooseAndRefocus(null)}>
              {t('Garder la photo actuelle')}
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-bad">
            {error}
          </p>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // picking the same file again still triggers a change
          void importFile(file);
        }}
      />
      <CameraModal
        open={camera}
        onClose={closeCamera}
        onUse={async (photo) => {
          choose(photo);
          closeCamera();
        }}
        onImport={() => {
          closeCamera();
          fileInput.current?.click();
        }}
      />
    </div>
  );
}
