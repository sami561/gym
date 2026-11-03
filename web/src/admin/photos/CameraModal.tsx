import { Fragment, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Camera, CameraOff, Check, ImageUp, RotateCcw, SwitchCamera } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ErrorNote } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { useI18n } from '../../i18n';
import {
  CAMERA_FINAL_PROBLEMS,
  CAMERA_PROBLEM_MESSAGES,
  cameraProblem,
  listCameras,
  nextCamera,
  startCamera,
  stopStream,
  type CameraProblem,
} from '../../lib/camera';
import { captureFrame } from '../../lib/photo';
import { photoErrorText, useObjectUrl } from './photos';

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  /** Saves the photo taken; when it rejects, the dialog stays open with the error. */
  onUse: (photo: Blob) => Promise<unknown>;
  /** Offered when the camera cannot start: pick a file instead. */
  onImport?: () => void;
}

/** Corner marks of the square that is saved (the preview shows exactly the crop). */
function Viewfinder() {
  const corner = 'absolute size-8 border-led/85';
  return (
    <span className="pointer-events-none absolute inset-[7%]" aria-hidden>
      <span className={clsx(corner, 'start-0 top-0 rounded-ss-xl border-s-2 border-t-2')} />
      <span className={clsx(corner, 'end-0 top-0 rounded-se-xl border-e-2 border-t-2')} />
      <span className={clsx(corner, 'start-0 bottom-0 rounded-es-xl border-s-2 border-b-2')} />
      <span className={clsx(corner, 'end-0 bottom-0 rounded-ee-xl border-e-2 border-b-2')} />
    </span>
  );
}

/** Webcam capture for the member file: preview, take, retake, use. */
export function CameraModal({ open, onClose, onUse, onImport }: CameraModalProps) {
  const { t } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [cameras, setCameras] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<Blob | null>(null);
  const shotUrl = useObjectUrl(shot);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The camera runs only while the dialog is open: closing it (or switching camera) stops every
  // track, so the camera light goes out. A camera that starts after the dialog closed is stopped too.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let current: MediaStream | null = null;
    setProblem(null);
    setReady(false);
    startCamera(cameraId).then(
      (started) => {
        if (cancelled) {
          stopStream(started);
          return;
        }
        current = started;
        setStream(started);
        void listCameras().then((ids) => {
          if (!cancelled) setCameras(ids);
        });
      },
      (reason: unknown) => {
        if (!cancelled) setProblem(cameraProblem(reason));
      },
    );
    return () => {
      cancelled = true;
      stopStream(current);
      setStream(null);
    };
  }, [open, cameraId, attempt]);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  // Every opening starts from the live preview.
  useEffect(() => {
    if (open) return;
    setShot(null);
    setError(null);
    setSaving(false);
  }, [open]);

  const capture = async () => {
    if (!video.current) return;
    setError(null);
    try {
      setShot(await captureFrame(video.current));
    } catch (reason) {
      setError(photoErrorText(reason, t));
    }
  };

  const use = async () => {
    if (!shot) return;
    setSaving(true);
    setError(null);
    try {
      await onUse(shot);
    } catch (reason) {
      setError(photoErrorText(reason, t));
    } finally {
      setSaving(false);
    }
  };

  const retake = () => {
    setShot(null);
    setError(null);
  };

  const switchTo = nextCamera(cameras, stream?.getVideoTracks()[0]?.getSettings().deviceId);

  // Each step gets its own buttons (keyed): React does not morph one into another, and the main
  // action of the new step takes the keyboard focus.
  let footer;
  if (problem) {
    footer = (
      <Fragment key="problem">
        {onImport && (
          <Button variant="secondary" icon={<ImageUp className="size-4" />} onClick={onImport}>
            {t('Importer une photo')}
          </Button>
        )}
        {CAMERA_FINAL_PROBLEMS.includes(problem) ? (
          <Button variant="ghost" onClick={onClose}>
            {t('Fermer')}
          </Button>
        ) : (
          <Button
            onClick={() => {
              setCameraId(undefined); // back to the default camera, in case the one picked was unplugged
              setAttempt((n) => n + 1);
            }}
          >
            {t('Réessayer')}
          </Button>
        )}
      </Fragment>
    );
  } else if (shot) {
    footer = (
      <Fragment key="review">
        <Button variant="secondary" icon={<RotateCcw className="size-4 rtl:-scale-x-100" />} disabled={saving} onClick={retake}>
          {t('Reprendre la photo')}
        </Button>
        <Button icon={<Check className="size-4" />} loading={saving} onClick={() => void use()} autoFocus>
          {t('Utiliser cette photo')}
        </Button>
      </Fragment>
    );
  } else {
    footer = (
      <Fragment key="live">
        {switchTo && (
          <Button variant="ghost" className="me-auto" icon={<SwitchCamera className="size-4" />} onClick={() => setCameraId(switchTo)}>
            {t('Changer de caméra')}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t('Annuler')}
        </Button>
        <Button icon={<Camera className="size-4" />} disabled={!ready} onClick={() => void capture()} autoFocus>
          {t('Prendre la photo')}
        </Button>
      </Fragment>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Prendre une photo')}
      description={problem ? undefined : t('Cadrez le visage au centre du carré, puis prenez la photo.')}
      footer={footer}
    >
      {problem ? (
        <div className="flex flex-col items-center gap-3 px-2 py-8 text-center" role="alert">
          <CameraOff className="size-10 text-muted" aria-hidden />
          <p className="font-semibold text-fg">{t('Caméra indisponible')}</p>
          <p className="max-w-sm text-sm text-fg-2">{t(CAMERA_PROBLEM_MESSAGES[problem])}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={video}
              autoPlay
              muted
              playsInline
              aria-label={t('Aperçu de la caméra')}
              onLoadedData={() => setReady(true)}
              className={clsx('size-full object-cover', shot && 'invisible')}
            />
            {shot && shotUrl ? <img src={shotUrl} alt={t('Photo prise')} className="absolute inset-0 size-full object-cover" /> : ready && <Viewfinder />}
            {!ready && !shot && (
              <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/80" role="status">
                <Spinner className="size-4" />
                {t('Démarrage de la caméra…')}
              </span>
            )}
          </div>
          {error && <ErrorNote message={error} />}
        </div>
      )}
    </Modal>
  );
}
