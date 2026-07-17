import { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Check, X, Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCroppedImage } from '@/lib/crop';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  onPrev: () => void;
  user: any;
  t: (key: string) => string;
}

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

export function StepYourProfile({ state, updateField, onNext, onPrev, user, t }: Props) {
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

  // Debounced username availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (state.username.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const [{ data: profileMatch }, { data: pageMatch }] = await Promise.all([
          supabase.from('profiles').select('id').eq('username', state.username).neq('id', user?.id ?? '').maybeSingle(),
          supabase.from('pages').select('id').eq('handle', state.username).neq('user_id', user?.id ?? '').maybeSingle(),
        ]);
        setUsernameStatus(profileMatch || pageMatch ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.username, user?.id]);

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
      const reader = new FileReader();
      reader.onloadend = () => updateField('avatarPreview', reader.result as string);
      reader.readAsDataURL(croppedFile);
    } catch {
      if (rawFile) {
        updateField('avatarFile', rawFile);
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

  const isValid = state.displayName.trim().length > 0 && state.username.trim().length >= 3 && usernameStatus !== 'taken' && usernameStatus !== 'checking';

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
              usernameStatus === 'taken' ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#C9A55C]/50'
            }`}
          />
        </div>
        {state.username.length >= 3 && (
          <div className="space-y-1">
            <p className="text-xs text-[#C9A55C]/70 font-body">
              titilinks.com/{state.username}
            </p>
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
          disabled={!isValid}
          className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
        >
          {t('onboardingFlow.continue')}
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
