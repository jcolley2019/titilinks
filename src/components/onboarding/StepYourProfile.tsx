import { useRef, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
  const [aspectRatio, setAspectRatio] = useState<number>(1);
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
          supabase.from('pages').select('id').eq('handle', state.username).maybeSingle(),
        ]);
        setUsernameStatus(profileMatch || pageMatch ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.username, user?.id]);

  const getCroppedImage = async (imageSrc: string, pixelCrop: Area): Promise<File> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise((resolve) => { image.onload = resolve; });
    const canvas = document.createElement('canvas');
    const maxSize = 800;
    const scaleX = image.naturalWidth / image.width || 1;
    const scaleY = image.naturalHeight / image.height || 1;
    let cropWidth = pixelCrop.width;
    let cropHeight = pixelCrop.height;
    if (cropWidth > maxSize || cropHeight > maxSize) {
      const ratio = Math.min(maxSize / cropWidth, maxSize / cropHeight);
      cropWidth = Math.round(cropWidth * ratio);
      cropHeight = Math.round(cropHeight * ratio);
    }
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      image,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0, 0,
      cropWidth,
      cropHeight
    );
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Crop failed')); return; }
          resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.8
      );
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Only JPEG, PNG, GIF, and WebP images are allowed');
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

  const aspectRatioOptions = [
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

  const avatarShape = (() => {
    switch (state.pageStyle) {
      case 'hero': return { className: 'w-full max-w-xs aspect-video rounded-xl', label: 'Hero Photo' };
      case 'full_bleed': return { className: 'w-36 aspect-[9/16] rounded-xl', label: 'Background Photo' };
      default: return { className: 'w-28 h-28 rounded-full', label: null };
    }
  })();

  return (
    <div className="space-y-8 max-w-md mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.yourProfile')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.yourProfileDesc')}
        </p>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <div className={`${avatarShape.className} overflow-hidden border-2 border-white/10 bg-white/5 flex items-center justify-center`}>
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-bold text-white/40">{initials}</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
        {compressing ? (
          <span className="flex items-center gap-1.5 text-sm text-[#C9A55C] font-body">
            <Loader2 className="w-3 h-3 animate-spin" />
            Optimizing...
          </span>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-[#C9A55C] hover:underline font-body"
          >
            {t('onboardingFlow.uploadPhoto')}
          </button>
        )}
        {avatarShape.label && (
          <span className="text-xs text-white/40 font-body">{avatarShape.label}</span>
        )}
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
                Checking availability...
              </p>
            )}
            {usernameStatus === 'available' && (
              <p className="flex items-center gap-1.5 text-xs text-green-400 font-body">
                <Check className="w-3 h-3" />
                Available
              </p>
            )}
            {usernameStatus === 'taken' && (
              <p className="flex items-center gap-1.5 text-xs text-red-400 font-body">
                <X className="w-3 h-3" />
                Username taken
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-white/60 hover:text-white transition-colors font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('onboardingFlow.back')}
        </button>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
        >
          {t('onboardingFlow.continue')}
        </button>
      </div>

      {/* Use Image Modal */}
      {modalStep === 'preview' && rawImageSrc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 px-4 pb-4 sm:pb-0">
          <div className="w-full max-w-sm bg-[#1a1714] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="font-display text-lg font-semibold text-white">Use Image</span>
              <button onClick={() => setModalStep('none')} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="rounded-xl overflow-hidden bg-white/5 mb-4" style={{ maxHeight: '300px' }}>
                <img src={rawImageSrc} alt="Preview" className="w-full h-full object-contain" style={{ maxHeight: '300px' }} />
              </div>
              <button
                onClick={() => setModalStep('crop')}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold font-body mb-2 hover:bg-white/10 transition-colors"
              >
                Crop Image
              </button>
              <button
                onClick={handleUseOriginal}
                className="w-full py-3 rounded-xl bg-white text-[#0e0c09] font-semibold font-body hover:opacity-90 transition-opacity"
              >
                Use Original
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Modal */}
      {modalStep === 'crop' && rawImageSrc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 px-4 pb-4 sm:pb-0">
          <div className="w-full max-w-sm bg-[#1a1714] rounded-2xl overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="font-display text-lg font-semibold text-white">Crop Image</span>
              <button onClick={() => setModalStep('none')} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Aspect ratio */}
              <div className="space-y-2">
                <p className="text-xs text-white/50 font-body">Aspect Ratio</p>
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
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Zoom */}
              <div className="space-y-2">
                <p className="text-xs text-white/50 font-body">Zoom: {zoom.toFixed(1)}x</p>
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
                Back
              </button>
              <button
                onClick={handleApplyCrop}
                className="w-full py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-semibold font-body hover:opacity-90 transition-opacity"
              >
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
