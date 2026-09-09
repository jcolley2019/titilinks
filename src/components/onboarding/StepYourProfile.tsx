import { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Check, X, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCroppedImage, cropErrorCauseKey } from '@/lib/crop';
import { validateHandle } from '@/lib/handle-rules';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import type { OnboardingState } from './useOnboardingWizard';
import { planOriginal } from '@/lib/onboarding-photo';
import { beginAvatarUpload } from '@/lib/onboarding-upload';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  onPrev: () => void;
  user: any;
  t: (key: string) => string;
  /** TL.ONB.PERF.1 — true while Continue is waiting on the photo upload. */
  uploading?: boolean;
}

// TL.ONB.PERF.1 — the last handle that came back available, remembered ACROSS
// mounts. Back remounts this step (AnimatePresence keys the step), and every
// fresh mount re-ran the 500 ms debounce + round-trip with Continue disabled
// throughout — PERF.0 measured ~0.5 s mocked, ~0.76 s against real Supabase, on
// a handle the user had already cleared and not touched since. Module-level so
// the remount cannot forget it; a keystroke moves off it and re-checks.
let lastAvailableHandle: string | null = null;

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSize = 800;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Compression failed')); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

// TL.ONB.PHOTO.1 — what onboarding keeps as the ORIGINAL. Under the cap the
// bytes are untouched (editor parity); over it, a 2400px "large original". The
// decision lives in src/lib/onboarding-photo.ts (unit-tested); this is the
// canvas that carries it out. Never throws into the caller: any failure
// falls back to the raw file so the original is never silently dropped.
function prepareOriginal(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const bail = () => { URL.revokeObjectURL(url); resolve(file); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const plan = planOriginal({ bytes: file.size, width: img.naturalWidth, height: img.naturalHeight });
      if (plan.keepBytes !== false) { resolve(file); return; }
      const target = plan;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, target.width, target.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
          },
          'image/jpeg',
          target.quality
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = bail;
    img.src = url;
  });
}

export function StepYourProfile({ state, updateField, onNext, onPrev, user, t, uploading = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modalStep, setModalStep] = useState<'none' | 'preview' | 'crop'>('none');
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectRatio, setAspectRatio] = useState<number>(state.pageStyle === 'full_bleed' ? 9 / 16 : 1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!state.displayName && user?.user_metadata?.full_name) {
      updateField('displayName', user.user_metadata.full_name);
    }
    if (!state.username && user?.email) {
      const prefix = user.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
      updateField('username', prefix.slice(0, 30));
    }
  }, []);

  // TL.HANDLE.1: format + reserved floor, checked locally on every keystroke.
  // 'format' | 'reserved' | null — see src/lib/handle-rules.ts. A failure here
  // outranks availability: a reserved word is unavailable to everyone, and the
  // pages_handle_rules CHECK would reject the write with a bare 23514.
  const handleError = validateHandle(state.username);

  // Debounced username availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (state.username.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }

    // Don't spend a round-trip on a handle the rules already reject.
    if (handleError) {
      setUsernameStatus('idle');
      return;
    }

    // TL.ONB.PERF.1 — a handle this session already cleared is still clear.
    // Show it as available immediately rather than disabling Continue for
    // another debounce + round-trip every time the user comes Back to step 2.
    if (state.username === lastAvailableHandle) {
      setUsernameStatus('available');
      return;
    }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const [{ data: profileMatch }, { data: pageMatch }] = await Promise.all([
          supabase.from('profiles').select('id').eq('username', state.username).neq('id', user?.id ?? '').maybeSingle(),
          supabase.from('pages').select('id').eq('handle', state.username).neq('user_id', user?.id ?? '').maybeSingle(),
        ]);
        const taken = Boolean(profileMatch || pageMatch);
        if (!taken) lastAvailableHandle = state.username;
        setUsernameStatus(taken ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.username, handleError, user?.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert(t('onboardingFlow.invalidImageType'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setRawImageSrc(reader.result as string);
      setRawFile(file);
      setModalStep('preview');
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setAspectRatio(1);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // TL.ONB.PERF.1 — the photo starts uploading HERE, the moment the user
  // accepts it, instead of on the Continue click. Continue then awaits a
  // promise that has usually already settled. A second pick supersedes the
  // first (beginAvatarUpload cancels it), so a stale result never lands.
  const kickOffUpload = (displayFile: File, originalFile: File | null) => {
    if (!user?.id) return;
    // The previous upload's URLs describe a photo the user just replaced.
    updateField('avatarUploadedUrl', null);
    updateField('avatarOriginalUrl', null);
    const handle = beginAvatarUpload(user.id, displayFile, originalFile);
    handle.promise.then(
      (result) => {
        if (handle.cancelled) return;
        updateField('avatarUploadedUrl', result.avatarUrl);
        updateField('avatarOriginalUrl', result.avatarOriginalUrl);
      },
      (err) => {
        // Not user-facing: Continue re-uploads synchronously and reports there,
        // exactly as it did before the photo moved off the click.
        if (handle.cancelled) return;
        console.error('[ONB.PERF.1] pre-upload failed (Continue will retry):', err);
      },
    );
  };

  const handleUseOriginal = async () => {
    if (!rawFile) return;
    setCompressing(true);
    setModalStep('none');
    try {
      let processedFile = rawFile;
      if (rawFile.size > 1 * 1024 * 1024) {
        processedFile = await compressImage(rawFile);
      }
      updateField('avatarFile', processedFile);
      // TL.ONB.PHOTO.1 — keep the raw pick (or its 2400px large-original) too.
      const originalFile = await prepareOriginal(rawFile);
      updateField('avatarOriginalFile', originalFile);
      kickOffUpload(processedFile, originalFile);
      const reader = new FileReader();
      reader.onloadend = () => updateField('avatarPreview', reader.result as string);
      reader.readAsDataURL(processedFile);
    } finally {
      setCompressing(false);
    }
  };

  const handleApplyCrop = async () => {
    if (!rawImageSrc || !croppedAreaPixels) return;
    setCompressing(true);
    setModalStep('none');
    try {
      const croppedFile = await getCroppedImage(rawImageSrc, croppedAreaPixels);
      updateField('avatarFile', croppedFile);
      // TL.ONB.PHOTO.1 — the ORIGINAL is the uncropped pick, exactly as the
      // editor stores photoOriginalFile beside its crop.
      let originalFile: File | null = null;
      if (rawFile) {
        originalFile = await prepareOriginal(rawFile);
        updateField('avatarOriginalFile', originalFile);
      }
      kickOffUpload(croppedFile, originalFile);
      const reader = new FileReader();
      reader.onloadend = () => updateField('avatarPreview', reader.result as string);
      reader.readAsDataURL(croppedFile);
    } catch (err) {
      // CROP.3a error truth: log the real cause (name+message), tell the user
      // with a concise hint, and keep the graceful fall-back to the original
      // photo so onboarding never dead-ends on a crop failure.
      console.error('[CROP] onboarding apply failed:', (err as any)?.name, (err as any)?.message, err);
      toast.error(`${t('onboardingFlow.cropFailedFallback')} — ${t(cropErrorCauseKey(err))}`);
      if (rawFile) {
        updateField('avatarFile', rawFile);
        updateField('avatarOriginalFile', rawFile);
        kickOffUpload(rawFile, rawFile);
        const reader = new FileReader();
        reader.onloadend = () => updateField('avatarPreview', reader.result as string);
        reader.readAsDataURL(rawFile);
      }
    } finally {
      setCompressing(false);
    }
  };

  // ONB.7e: a full-screen background is a portrait phone canvas —
  // crop 9:16 (Free as escape hatch). Hero keeps the original set.
  const aspectRatioOptions = state.pageStyle === 'full_bleed'
    ? [
        { label: '9:16', value: 9 / 16 },
        { label: 'Free', value: 0 },
      ]
    : [
        { label: 'Square', value: 1 },
        { label: 'Free', value: 0 },
        { label: '4:3', value: 4 / 3 },
        { label: '3:2', value: 3 / 2 },
      ];

  const avatarSrc = state.avatarPreview || user?.user_metadata?.avatar_url || null;
  const initials = state.displayName
    ? state.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  // TL.HANDLE.1: !handleError covers both the length floor and the shape, and
  // blocks Continue on a reserved word — it is decided locally, so unlike
  // 'taken' it can never be softened by a failed availability round-trip.
  const isValid = state.displayName.trim().length > 0 && !handleError && usernameStatus !== 'taken' && usernameStatus !== 'checking';

  // ONB.6: photo nudge — first Continue without a photo prompts to add
  // one; a second attempt acknowledges the choice and proceeds.
  const [photoModal, setPhotoModal] = useState<'none' | 'nudge' | 'skip'>('none');
  const [photoNudged, setPhotoNudged] = useState(false);
  const handleContinue = () => {
    if (!avatarSrc) {
      if (!photoNudged) {
        setPhotoNudged(true);
        setPhotoModal('nudge');
        return;
      }
      setPhotoModal('skip');
      return;
    }
    onNext();
  };

  return (
    <div className="flex flex-col gap-8 flex-1 w-full max-w-md mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.yourProfile')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.yourProfileDesc')}
        </p>
      </div>

      {/* Photo affordance — minimal; the ONB.10 live backdrop is the
          preview, so no boxed image here. */}
      <div className="w-full flex justify-center">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2 py-4 px-8"
        >
          {compressing ? (
            <Loader2 className="w-8 h-8 animate-spin text-[#C9A55C]" />
          ) : (
            <Camera className="w-8 h-8 text-[#C9A55C]" />
          )}
          <span className="text-sm text-[#C9A55C] font-body">
            {avatarSrc ? (t('onboardingFlow.changePhoto') || 'Change photo') : t('onboardingFlow.uploadPhoto')}
          </span>
          {!avatarSrc && (
            <span className="text-xs text-white/40 font-body">
              {state.pageStyle === 'full_bleed' ? t('onboardingFlow.backgroundPhoto') : t('onboardingFlow.heroPhoto')}
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Display Name */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80 font-body">
          {t('onboardingFlow.displayName')}
        </label>
        <input
          type="text"
          value={state.displayName}
          onChange={(e) => updateField('displayName', e.target.value)}
          placeholder={t('onboardingFlow.displayNamePlaceholder')}
          className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 font-body"
        />
      </div>

      {/* Username */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-white/80 font-body">
          {t('onboardingFlow.username')}
        </label>
        <div className="flex items-center">
          <span className="text-white/40 mr-1 font-body">@</span>
          <input
            type="text"
            value={state.username}
            onChange={(e) => {
              const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
              updateField('username', val);
            }}
            placeholder={t('onboardingFlow.usernamePlaceholder')}
            className={`flex-1 px-4 py-3 rounded-lg bg-white/5 border text-white placeholder:text-white/30 focus:outline-none font-body ${
              usernameStatus === 'taken' || (handleError && state.username.length >= 3)
                ? 'border-red-500 focus:border-red-500'
                : 'border-white/10 focus:border-[#C9A55C]/50'
            }`}
          />
        </div>
        {state.username.length >= 3 && (
          <div className="space-y-1">
            <p className="text-xs text-[#C9A55C]/70 font-body">
              titilinks.com/{state.username}
            </p>
            {/* TL.HANDLE.1: the local rules outrank availability — a reserved
                or malformed handle never reaches the uniqueness query. */}
            {handleError === 'reserved' && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 font-body">
                <X className="w-3 h-3 shrink-0" />
                {t('onboardingFlow.usernameReserved')}
              </p>
            )}
            {handleError === 'format' && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 font-body">
                <X className="w-3 h-3 shrink-0" />
                {t('onboardingFlow.usernameFormat')}
              </p>
            )}
            {usernameStatus === 'checking' && (
              <p className="flex items-center gap-1.5 text-xs text-white/40 font-body">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('onboardingFlow.checkingAvailability')}
              </p>
            )}
            {usernameStatus === 'available' && (
              <p className="flex items-center gap-1.5 text-xs text-green-400 font-body">
                <Check className="w-3 h-3" />
                {t('onboardingFlow.available')}
              </p>
            )}
            {usernameStatus === 'taken' && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 font-body">
                <X className="w-3 h-3" />
                {t('onboardingFlow.usernameTaken')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-auto sticky bottom-0 z-20 -mx-6 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[#0e0c09]/85 backdrop-blur-md border-t border-white/10 flex justify-between items-center">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-white/60 hover:text-white transition-colors font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('onboardingFlow.back')}
        </button>
        <button
          onClick={handleContinue}
          disabled={!isValid || uploading}
          data-testid="onb-continue"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
        >
          {/* TL.ONB.PERF.1 — only shown when the pick-time upload is still in
              flight; a finished upload keeps the button reading "Continue". */}
          {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
          {uploading ? t('onboardingFlow.uploading') : t('onboardingFlow.continue')}
        </button>
      </div>

      {/* ONB.6 photo nudge — first Continue without a photo */}
      {photoModal === 'nudge' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 pt-20 pb-4">
          <div className="w-full max-w-sm bg-[#1a1714] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="font-display text-lg font-semibold text-white">{t('onboardingFlow.photoNudgeTitle')}</span>
              <button onClick={() => setPhotoModal('none')} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-white/60 text-sm font-body mb-4">
                {state.pageStyle === 'full_bleed' ? t('onboardingFlow.photoNudgeBodyFullBleed') : t('onboardingFlow.photoNudgeBodyHero')}
              </p>
              <button
                onClick={() => { setPhotoModal('none'); fileInputRef.current?.click(); }}
                className="w-full py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-semibold font-body mb-2 hover:opacity-90 transition-opacity"
              >
                {t('onboardingFlow.photoNudgeAdd')}
              </button>
              <button
                onClick={() => setPhotoModal('none')}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold font-body hover:bg-white/10 transition-colors"
              >
                {t('onboardingFlow.photoNudgeNotNow')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ONB.6 photo skip acknowledgment — second Continue without a photo */}
      {photoModal === 'skip' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 pt-20 pb-4">
          <div className="w-full max-w-sm bg-[#1a1714] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="font-display text-lg font-semibold text-white">{t('onboardingFlow.photoSkipTitle')}</span>
              <button onClick={() => setPhotoModal('none')} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-white/60 text-sm font-body mb-4">{t('onboardingFlow.photoSkipBody')}</p>
              <button
                onClick={() => { setPhotoModal('none'); onNext(); }}
                className="w-full py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-semibold font-body hover:opacity-90 transition-opacity"
              >
                {t('onboardingFlow.photoSkipContinue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Use Image Modal */}
      {modalStep === 'preview' && rawImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 pt-20 pb-4">
          <div className="w-full max-w-sm bg-[#1a1714] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="font-display text-lg font-semibold text-white">{t('onboardingFlow.useImage')}</span>
              <button onClick={() => setModalStep('none')} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="rounded-xl overflow-hidden bg-white/5 mb-4" style={{ maxHeight: '300px' }}>
                <img src={rawImageSrc} alt={t('onboardingFlow.previewAlt')} className="w-full h-full object-contain" style={{ maxHeight: '300px' }} />
              </div>
              <button
                onClick={() => setModalStep('crop')}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold font-body mb-2 hover:bg-white/10 transition-colors"
              >
                {t('onboardingFlow.cropImage')}
              </button>
              <button
                onClick={handleUseOriginal}
                className="w-full py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-semibold font-body hover:opacity-90 transition-opacity"
              >
                {t('onboardingFlow.useOriginal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {modalStep === 'crop' && rawImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 pt-20 pb-4">
          <div className="w-full max-w-sm bg-[#1a1714] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="font-display text-lg font-semibold text-white">{t('onboardingFlow.cropImage')}</span>
              <button onClick={() => setModalStep('none')} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Aspect ratio */}
              <div className="space-y-2">
                <p className="text-xs text-white/50 font-body">{t('onboardingFlow.aspectRatio')}</p>
                <div className="flex gap-2 flex-wrap">
                  {aspectRatioOptions.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setAspectRatio(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-body border transition-all ${
                        aspectRatio === opt.value
                          ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                          : 'border-white/10 text-white/60 hover:border-white/20'
                      }`}
                    >
                      {opt.label === 'Free'
                        ? t('onboardingFlow.aspectFree')
                        : opt.label === 'Square'
                        ? t('onboardingFlow.aspectSquare')
                        : opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Zoom */}
              <div className="space-y-2">
                <p className="text-xs text-white/50 font-body">{t('onboardingFlow.zoomLevel').replace('{value}', zoom.toFixed(1))}</p>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-[#C9A55C]"
                />
              </div>
              {/* Crop area */}
              <div className="relative bg-black rounded-xl overflow-hidden" style={{ height: '240px' }}>
                <Cropper
                  image={rawImageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={aspectRatio === 0 ? undefined : aspectRatio}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                />
              </div>
              {/* Buttons */}
              <button
                onClick={() => setModalStep('preview')}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold font-body hover:bg-white/10 transition-colors"
              >
                {t('onboardingFlow.back')}
              </button>
              <button
                onClick={handleApplyCrop}
                className="w-full py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-semibold font-body hover:opacity-90 transition-opacity"
              >
                {t('onboardingFlow.applyCrop')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
