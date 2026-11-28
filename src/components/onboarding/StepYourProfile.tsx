import { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Check, X, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cropErrorCauseKey } from '@/lib/crop';
import { validateHandle } from '@/lib/handle-rules';
import type { OnboardingState } from './useOnboardingWizard';
import { prepareImage, validateImageInput } from '@/lib/prepare-image';
import { beginAvatarUpload } from '@/lib/onboarding-upload';
import type { HeroEnhance } from '@/lib/hero-enhance';
import { HeroPhotoEditor, type HeroPhotoResult } from '@/components/HeroPhotoEditor';

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

// TL.ONB.PHOTO.1 / MEDIA.PHOTO.2 — what onboarding keeps as the ORIGINAL: the
// shared prepared master (src/lib/prepare-image.ts — WebP ≤ 4096 px, EXIF/GPS
// gone), exactly what the editor's hero pick uploads. Never throws into the
// caller: a failure falls back to the raw file so the original is never
// silently dropped (the display copy still ships either way).
async function prepareOriginal(file: File): Promise<File> {
  try {
    return (await prepareImage(file)).file;
  } catch (err) {
    console.error('[MEDIA.PHOTO.2] onboarding original prepare failed (keeping the pick):', err);
    return file;
  }
}

export function StepYourProfile({ state, updateField, onNext, onPrev, user, t, uploading = false }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PHOTO.EDITOR.1 — the picked photo, while the photo editor is open on it.
  // The editor is the SAME component the page editor opens (HeroPhotoEditor):
  // its frame is the shape the page shows the photo in (the hero box, or the
  // whole screen on a full-screen page), so a crop made here and one made
  // there are one thing. `id` remounts it for every pick: the Auto enhance
  // switch off, zoom 1, centred.
  const [pick, setPick] = useState<{ src: string; file: File; id: number } | null>(null);
  const pickCount = useRef(0);
  const isFullBleed = state.pageStyle === 'full_bleed';

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
          supabase.from('pages_public').select('id').eq('handle', state.username).neq('user_id', user?.id ?? '').maybeSingle(),
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
    // MEDIA.PHOTO.2 — the shared gate (type + 40 MB input cap, HEIC off-iOS).
    const gate = validateImageInput(file);
    if (!gate.valid) {
      alert(gate.error || t('onboardingFlow.invalidImageType'));
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      // PHOTO.EDITOR.1: the photo editor opens on the pick straight away.
      pickCount.current += 1;
      setPick({ src: reader.result as string, file, id: pickCount.current });
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

  // HERO.FIT.3 — the photo on screen and the window that frames it change in
  // ONE update: a window belongs to exactly one display file, so the preview
  // must never paint the new file under the old window (or the reverse). A
  // photo kept as picked (a GIF) carries no window. PHOTO.POLISH.2: the Auto
  // enhance baked into that file travels in the same update, and is cleared the
  // same way.
  const showPhoto = (preview: string, avatarWindow: unknown, avatarWindowSource: unknown, avatarEnhance: HeroEnhance | null) => {
    updateField('avatarPreview', preview);
    updateField('avatarWindow', avatarWindow);
    updateField('avatarWindowSource', avatarWindowSource);
    updateField('avatarEnhance', avatarEnhance);
  };

  // OK in the photo editor. The display file is already baked (bakeHeroPhoto,
  // the editor's own bake): the framed area plus only the margin other screen
  // shapes can show, with the framed WINDOW to store against it, so the page
  // paints exactly what was framed here on every screen. A GIF comes back with
  // no file: it is kept as picked.
  const handleApply = async (result: HeroPhotoResult) => {
    if (!pick) return;
    const rawFile = pick.file;
    setCompressing(true);
    setPick(null);
    try {
      // TL.ONB.PHOTO.1 / MEDIA.PHOTO.2 — the ORIGINAL is the uncropped pick as
      // the shared prepared master, exactly as the editor stores
      // photoOriginalFile beside its crop (never the raw bytes, which carry
      // EXIF/GPS).
      const originalFile = await prepareOriginal(rawFile);
      const displayFile = result.file ?? originalFile;
      updateField('avatarFile', displayFile);
      updateField('avatarOriginalFile', originalFile);
      kickOffUpload(displayFile, originalFile);
      const reader = new FileReader();
      reader.onloadend = () => (result.file
        ? showPhoto(reader.result as string, result.window, result.windowSource, result.enhance)
        : showPhoto(reader.result as string, null, null, null));
      reader.readAsDataURL(displayFile);
    } finally {
      setCompressing(false);
    }
  };

  // CROP.3a error truth: the editor logged the real cause; tell the user with a
  // concise hint, and keep the graceful fall-back to the photo as picked so
  // onboarding never dead-ends on a crop failure.
  const handleBakeError = (err: unknown) => {
    toast.error(`${t('onboardingFlow.cropFailedFallback')} — ${t(cropErrorCauseKey(err))}`);
    const rawFile = pick?.file;
    setPick(null);
    if (!rawFile) return;
    updateField('avatarFile', rawFile);
    updateField('avatarOriginalFile', rawFile);
    kickOffUpload(rawFile, rawFile);
    const reader = new FileReader();
    reader.onloadend = () => showPhoto(reader.result as string, null, null, null);
    reader.readAsDataURL(rawFile);
  };

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

      {/* PHOTO.EDITOR.1 — the ONE photo editor (it portals itself to the body),
          opened straight away on a pick. Change photo above opens the gallery,
          which lands here again. */}
      {pick && (
        <HeroPhotoEditor
          key={pick.id}
          image={pick.src}
          kind={isFullBleed ? 'full_bleed' : 'hero'}
          isOriginal
          enhanceOffered
          croppable={pick.file.type !== 'image/gif'}
          isExisting={false}
          saving={false}
          onApply={handleApply}
          onNewPhoto={() => fileInputRef.current?.click()}
          onClose={() => setPick(null)}
          onBakeError={handleBakeError}
        />
      )}
    </div>
  );
}
