import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { User, Upload, Palette, Sun, Moon, Loader2, Check } from 'lucide-react';

const ACCENT_COLORS = [
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#10B981' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Red', value: '#EF4444' },
];

const TOTAL_STEPS = 2;

const formSchema = z.object({
  handle: z.string()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be less than 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Handle can only contain lowercase letters, numbers, and hyphens')
    .regex(/^[a-z]/, 'Handle must start with a letter')
    .regex(/[a-z0-9]$/, 'Handle must end with a letter or number')
    .refine((val) => !val.includes('--'), 'Handle cannot contain consecutive hyphens'),
  display_name: z.string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be less than 50 characters'),
  bio: z.string().max(200, 'Bio must be less than 200 characters').optional(),
  theme_mode: z.enum(['light', 'dark']),
  accent_color: z.string(),
});

type FormData = z.infer<typeof formSchema>;

interface OnboardingFormProps {
  onComplete: () => void;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        return (
          <div key={stepNum} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                isCompleted
                  ? 'gradient-gold text-primary-foreground'
                  : isActive
                    ? 'border-2 border-primary text-primary'
                    : 'border-2 border-border text-muted-foreground'
              }`}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : stepNum}
            </div>
            {i < totalSteps - 1 && (
              <div className={`w-12 h-0.5 transition-colors duration-300 ${isCompleted ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

export function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [handleTouched, setHandleTouched] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      handle: '',
      display_name: '',
      bio: '',
      theme_mode: 'dark',
      accent_color: ACCENT_COLORS[0].value,
    },
    mode: 'onTouched',
  });

  // Auto-fill handle from display name (only if user hasn't manually edited handle)
  const displayName = form.watch('display_name');
  useEffect(() => {
    if (!handleTouched && displayName) {
      const slug = slugify(displayName);
      if (slug.length >= 1) {
        form.setValue('handle', slug, { shouldValidate: form.formState.isSubmitted });
      }
    }
  }, [displayName, handleTouched, form]);

  const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Avatar must be less than 2MB');
        return;
      }
      if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
        toast.error('Only JPEG, PNG, GIF, and WebP images are allowed');
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (userId: string): Promise<string | null> => {
    if (!avatarFile) return null;

    const fileExt = avatarFile.name.split('.').pop();
    const filePath = `${userId}/${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile);

    if (error) {
      console.error('Error uploading avatar:', error);
      throw new Error('Failed to upload avatar');
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      // Check if handle is unique
      const { data: existingPage, error: checkError } = await supabase
        .from('pages')
        .select('id')
        .eq('handle', data.handle)
        .maybeSingle();

      if (checkError) throw checkError;
      if (existingPage) {
        form.setError('handle', { message: 'This handle is already taken' });
        toast.error('This handle is already taken. Please choose a different one.');
        setDirection(-1);
        setStep(1);
        setIsSubmitting(false);
        return;
      }

      // Upload avatar if provided
      let avatarUrl: string | null = null;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(user.id);
      }

      // Create the page
      const { data: page, error: pageError } = await supabase
        .from('pages')
        .insert({
          user_id: user.id,
          handle: data.handle,
          display_name: data.display_name,
          bio: data.bio || null,
          avatar_url: avatarUrl,
          theme_json: {
            mode: data.theme_mode,
            accent: data.accent_color,
          },
        })
        .select()
        .single();

      if (pageError) throw pageError;

      // Create shop mode
      const { data: shopMode, error: shopModeError } = await supabase
        .from('modes')
        .insert({
          page_id: page.id,
          type: 'shop',
        })
        .select()
        .single();

      if (shopModeError) throw shopModeError;

      // Create recruit mode
      const { data: recruitMode, error: recruitModeError } = await supabase
        .from('modes')
        .insert({
          page_id: page.id,
          type: 'recruit',
        })
        .select()
        .single();

      if (recruitModeError) throw recruitModeError;

      // Create shop mode blocks
      const shopBlocks = [
        { mode_id: shopMode.id, type: 'primary_cta' as const, title: 'Primary CTA', order_index: 0, is_enabled: true },
        { mode_id: shopMode.id, type: 'product_cards' as const, title: 'Products', order_index: 1, is_enabled: true },
        { mode_id: shopMode.id, type: 'social_links' as const, title: 'Social Links', order_index: 2, is_enabled: true },
        { mode_id: shopMode.id, type: 'links' as const, title: 'Links', order_index: 3, is_enabled: true },
      ];

      const { error: shopBlocksError } = await supabase
        .from('blocks')
        .insert(shopBlocks);

      if (shopBlocksError) throw shopBlocksError;

      // Create recruit mode blocks
      const recruitBlocks = [
        { mode_id: recruitMode.id, type: 'primary_cta' as const, title: 'Primary CTA', order_index: 0, is_enabled: true },
        { mode_id: recruitMode.id, type: 'featured_media' as const, title: 'Featured Media', order_index: 1, is_enabled: true },
        { mode_id: recruitMode.id, type: 'social_links' as const, title: 'Social Links', order_index: 2, is_enabled: true },
        { mode_id: recruitMode.id, type: 'links' as const, title: 'Links', order_index: 3, is_enabled: true },
      ];

      const { error: recruitBlocksError } = await supabase
        .from('blocks')
        .insert(recruitBlocks);

      if (recruitBlocksError) throw recruitBlocksError;

      // Show success animation
      setShowSuccess(true);
      setTimeout(() => {
        toast.success('Your page has been created!');
        onComplete();
      }, 1500);
    } catch (error: any) {
      console.error('Error creating page:', error);
      toast.error(error.message || 'Failed to create page');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = async () => {
    if (step === 1) {
      const isValid = await form.trigger(['handle', 'display_name', 'bio']);
      if (isValid) {
        setDirection(1);
        setStep(2);
      }
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-lg mx-auto"
      >
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-full gradient-gold flex items-center justify-center mb-6 shadow-lg shadow-primary/30"
            >
              <Check className="h-10 w-10 text-primary-foreground" />
            </motion.div>
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl font-bold text-foreground mb-2"
            >
              Page Created!
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="text-muted-foreground text-sm"
            >
              Redirecting to your editor…
            </motion.p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-lg mx-auto"
    >
      <Card className="bg-card border-border">
        <CardHeader className="text-center">
          <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} />
          <CardTitle className="text-2xl font-bold text-foreground">Create Your Page</CardTitle>
          <CardDescription>
            Step {step} of {TOTAL_STEPS}: {step === 1 ? 'Profile Details' : 'Theme & Appearance'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <AnimatePresence mode="wait" custom={direction}>
              {step === 1 && (
                <motion.div
                  key="step-1"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="space-y-6"
                >
                  {/* Avatar Upload */}
                  <div className="flex flex-col items-center gap-4">
                    <Avatar className="h-24 w-24 border-2 border-border">
                      <AvatarImage src={avatarPreview || undefined} />
                      <AvatarFallback className="bg-secondary">
                        <User className="h-10 w-10 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                    <Label htmlFor="avatar" className="cursor-pointer">
                      <div className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors">
                        <Upload className="h-4 w-4" />
                        Upload Avatar
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Max 2MB, JPEG/PNG/GIF/WebP</p>
                      <Input
                        id="avatar"
                        type="file"
                        accept=".jpg,.jpeg,.png,.gif,.webp"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </Label>
                  </div>

                  {/* Display Name */}
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      placeholder="Your Name"
                      {...form.register('display_name')}
                    />
                    {form.formState.errors.display_name && (
                      <p className="text-sm text-destructive">{form.formState.errors.display_name.message}</p>
                    )}
                  </div>

                  {/* Handle */}
                  <div className="space-y-2">
                    <Label htmlFor="handle">Handle</Label>
                    <div className="flex items-center">
                      <span className="text-muted-foreground text-sm mr-1">@</span>
                      <Input
                        id="handle"
                        placeholder="yourhandle"
                        {...form.register('handle', {
                          onChange: () => setHandleTouched(true),
                        })}
                        className="flex-1"
                      />
                    </div>
                    {form.formState.errors.handle && (
                      <p className="text-sm text-destructive">{form.formState.errors.handle.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">titilinks.com/{form.watch('handle') || 'yourhandle'}</p>
                  </div>

                  {/* Bio */}
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio (optional)</Label>
                    <Textarea
                      id="bio"
                      placeholder="Tell people about yourself..."
                      {...form.register('bio')}
                      rows={3}
                    />
                    {form.formState.errors.bio && (
                      <p className="text-sm text-destructive">{form.formState.errors.bio.message}</p>
                    )}
                  </div>

                  <Button type="button" onClick={nextStep} className="w-full gradient-gold text-primary-foreground">
                    Continue
                  </Button>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="space-y-6"
                >
                  {/* Theme Mode */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Theme Mode
                    </Label>
                    <RadioGroup
                      value={form.watch('theme_mode')}
                      onValueChange={(value) => form.setValue('theme_mode', value as 'light' | 'dark')}
                      className="grid grid-cols-2 gap-4"
                    >
                      <Label
                        htmlFor="light"
                        className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          form.watch('theme_mode') === 'light'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <RadioGroupItem value="light" id="light" className="sr-only" />
                        <Sun className="h-5 w-5" />
                        <span>Light</span>
                      </Label>
                      <Label
                        htmlFor="dark"
                        className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          form.watch('theme_mode') === 'dark'
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <RadioGroupItem value="dark" id="dark" className="sr-only" />
                        <Moon className="h-5 w-5" />
                        <span>Dark</span>
                      </Label>
                    </RadioGroup>
                  </div>

                  {/* Accent Color */}
                  <div className="space-y-3">
                    <Label>Accent Color</Label>
                    <div className="flex flex-wrap gap-3">
                      {ACCENT_COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => form.setValue('accent_color', color.value)}
                          className={`w-10 h-10 rounded-full border-2 transition-all ${
                            form.watch('accent_color') === color.value
                              ? 'border-foreground scale-110'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="p-4 rounded-lg border border-border bg-secondary/50">
                    <p className="text-sm text-muted-foreground mb-2">Preview</p>
                    <div
                      className={`p-4 rounded-lg ${form.watch('theme_mode') === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full"
                          style={{ backgroundColor: form.watch('accent_color') }}
                        />
                        <div>
                          <p className="font-medium">{form.watch('display_name') || 'Your Name'}</p>
                          <p className={`text-sm ${form.watch('theme_mode') === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            @{form.watch('handle') || 'handle'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 gradient-gold text-primary-foreground"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Page'
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
