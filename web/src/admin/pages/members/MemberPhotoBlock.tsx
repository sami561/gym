import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, ImageUp, Trash2 } from 'lucide-react';
import { membersApi } from '../../../api/endpoints';
import type { MemberDetail, MemberDto } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useI18n } from '../../../i18n';
import { fullName } from '../../../lib/format';
import { preparePhoto } from '../../../lib/photo';
import { CameraModal } from '../../photos/CameraModal';
import { MemberAvatar } from '../../photos/MemberAvatar';
import { memberPhotoKey, photoErrorText } from '../../photos/photos';

/**
 * Head of the member file: the portrait with its actions (upload a file, take one with the webcam,
 * delete), next to `children` (name, code, status).
 */
export function MemberPhotoBlock({ member, children }: { member: MemberDto; children: ReactNode }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  // Stable: CameraModal's own close handler (and its Escape guard while saving) depends on it.
  const closeCamera = useCallback(() => setCamera(false), []);
  const [preparing, setPreparing] = useState(false);
  const name = fullName(member);

  // The answer carries the new photoUpdatedAt: show it at once, then refresh what lists the member.
  const applied = (updated: MemberDto) => {
    queryClient.setQueryData<MemberDetail>(['member', member.id], (old) => (old ? { ...old, member: { ...old.member, ...updated } } : old));
    void queryClient.invalidateQueries({ queryKey: ['member', member.id] });
    void queryClient.invalidateQueries({ queryKey: ['members'] });
    void queryClient.invalidateQueries({ queryKey: memberPhotoKey(member.id) });
  };

  const upload = useMutation({
    mutationFn: (photo: Blob) => membersApi.setPhoto(member.id, photo),
    onSuccess: (updated) => {
      applied(updated);
      toast.success(t('Photo enregistrée.'));
    },
  });

  const remove = useMutation({
    mutationFn: () => membersApi.removePhoto(member.id),
    onSuccess: (updated) => {
      applied(updated);
      toast.success(t('Photo supprimée.'));
    },
    onError: (error) => toast.error(photoErrorText(error, t)),
  });

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setPreparing(true);
    try {
      await upload.mutateAsync(await preparePhoto(file));
    } catch (error) {
      toast.error(photoErrorText(error, t));
    } finally {
      setPreparing(false);
    }
  };

  const confirmRemove = async () => {
    const ok = await confirm({
      title: t('Supprimer la photo de {name} ?', { name }),
      message: t('La photo ne sera plus affichée à l’accueil ni dans l’application du membre.'),
      confirmLabel: t('Supprimer la photo'),
      danger: true,
    });
    if (ok) remove.mutate();
  };

  const busy = preparing || upload.isPending || remove.isPending;

  // Portrait beside the name; the photo actions under the name, or across the full width on phones.
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:gap-x-5">
      <MemberAvatar
        memberId={member.id}
        name={name}
        photoUpdatedAt={member.photoUpdatedAt}
        size="lg"
        busyLabel={busy ? t('Enregistrement de la photo…') : undefined}
        className="sm:row-span-2"
      />
      <div className="min-w-0 sm:self-end">{children}</div>
      <div className="col-span-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:col-start-2 sm:self-start">
        <Button size="sm" variant="secondary" icon={<ImageUp className="size-3.5" />} disabled={busy} onClick={() => fileInput.current?.click()}>
          {t('Importer une photo')}
        </Button>
        <Button size="sm" variant="secondary" icon={<Camera className="size-3.5" />} disabled={busy} onClick={() => setCamera(true)}>
          {t('Prendre une photo')}
        </Button>
        {member.photoUpdatedAt && (
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} disabled={busy} onClick={() => void confirmRemove()}>
            {t('Supprimer la photo')}
          </Button>
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
          await upload.mutateAsync(photo);
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
