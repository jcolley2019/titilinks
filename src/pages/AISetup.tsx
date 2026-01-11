import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Sparkles, 
  Wand2, 
  Eye, 
  ArrowRight, 
  ArrowLeft,
  User,
  Link2,
  Share2,
  Image as ImageIcon,
  ShoppingBag,
  Loader2,
  Check,
  ExternalLink,
  RefreshCw,
  Settings,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { buildDraftPlan, enhancePlanWithAIBios, type DraftPlan, type IntakeData } from '@/lib/draft-plan-builder';
import { persistDraftPlan, checkHandleAvailable } from '@/lib/plan-persistence';

const creatorTypes = [
  { value: 'streaming_tiktok', label: 'Streaming / TikTok Creator' },
  { value: 'gamer', label: 'Gamer' },
  { value: 'fitness', label: 'Fitness Creator' },
  { value: 'musician', label: 'Musician' },
  { value: 'affiliate_marketer', label: 'Affiliate Marketer' },
  { value: 'adult_creator', label: 'Adult Creator' },
] as const;

const toneOptions = [
  { value: 'professional', label: 'Professional', description: 'Clean and business-focused' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'bold', label: 'Bold', description: 'Eye-catching and confident' },
  { value: 'minimal', label: 'Minimal', description: 'Simple and elegant' },
  { value: 'funny', label: 'Funny', description: 'Playful and humorous' },
] as const;

const urlSchema = z.string().url({ message: 'Please enter a valid URL' }).or(z.literal(''));

const formSchema = z.object({
  handle: z.string()
    .min(3, 'Handle must be at least 3 characters')
    .max(30, 'Handle must be 30 characters or less')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed'),
  display_name: z.string()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must be 50 characters or less'),
  creator_type: z.enum(['streaming_tiktok', 'gamer', 'fitness', 'musician', 'affiliate_marketer', 'adult_creator']),
  tone: z.enum(['professional', 'friendly', 'bold', 'minimal', 'funny']),
  personal_website_url: z.string().url({ message: 'Please enter a valid URL' }),
  primary_offer_url: z.string().url({ message: 'Please enter a valid URL' }),
  creator_program_url: z.string().url({ message: 'Please enter a valid URL' }),
  social_tiktok: urlSchema.optional(),
  social_instagram: urlSchema.optional(),
  social_youtube: urlSchema.optional(),
  social_facebook: urlSchema.optional(),
  social_facebook_group: urlSchema.optional(),
  social_snapchat: urlSchema.optional(),
  social_kick: urlSchema.optional(),
  social_twitch: urlSchema.optional(),
  social_discord: urlSchema.optional(),
  social_x: urlSchema.optional(),
  social_spotify: urlSchema.optional(),
  social_apple_music: urlSchema.optional(),
  featured_media_1: urlSchema.optional(),
  featured_media_2: urlSchema.optional(),
  featured_media_3: urlSchema.optional(),
  product_1_url: urlSchema.optional(),
  product_1_title: z.string().max(100).optional(),
  product_2_url: urlSchema.optional(),
  product_2_title: z.string().max(100).optional(),
  product_3_url: urlSchema.optional(),
  product_3_title: z.string().max(100).optional(),
  product_4_url: urlSchema.optional(),
  product_4_title: z.string().max(100).optional(),
  product_5_url: urlSchema.optional(),
  product_5_title: z.string().max(100).optional(),
  product_6_url: urlSchema.optional(),
  product_6_title: z.string().max(100).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function AISetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [draftPlan, setDraftPlan] = useState<DraftPlan | null>(null);
  const [useAICopy, setUseAICopy] = useState(true);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      handle: '',
      display_name: '',
      creator_type: undefined,
      tone: undefined,
      personal_website_url: '',
      primary_offer_url: '',
      creator_program_url: '',
    },
    mode: 'onChange',
  });

  const validateStep = async (currentStep: number): Promise<boolean> => {
    let fieldsToValidate: (keyof FormData)[] = [];
    switch (currentStep) {
      case 1:
        fieldsToValidate = ['handle', 'display_name', 'creator_type', 'tone'];
        break;
      case 2:
        fieldsToValidate = ['personal_website_url', 'primary_offer_url', 'creator_program_url'];
        break;
      default:
        return true;
    }
    return await form.trigger(fieldsToValidate);
  };

  const handleNext = async () => {
    const isValid = await validateStep(step);
    if (isValid) setStep(step + 1);
  };

  const handleBack = () => setStep(step - 1);

  const formDataToIntake = (data: FormData): IntakeData => ({
    handle: data.handle,
    display_name: data.display_name,
    creator_type: data.creator_type,
    tone: data.tone,
    personal_website_url: data.personal_website_url,
    primary_offer_url: data.primary_offer_url,
    creator_program_url: data.creator_program_url,
    social_tiktok: data.social_tiktok || undefined,
    social_instagram: data.social_instagram || undefined,
    social_youtube: data.social_youtube || undefined,
    social_facebook: data.social_facebook || undefined,
    social_facebook_group: data.social_facebook_group || undefined,
    social_snapchat: data.social_snapchat || undefined,
    social_kick: data.social_kick || undefined,
    social_twitch: data.social_twitch || undefined,
    social_discord: data.social_discord || undefined,
    social_x: data.social_x || undefined,
    social_spotify: data.social_spotify || undefined,
    social_apple_music: data.social_apple_music || undefined,
    featured_media_1: data.featured_media_1 || undefined,
    featured_media_2: data.featured_media_2 || undefined,
    featured_media_3: data.featured_media_3 || undefined,
    product_1_url: data.product_1_url || undefined,
    product_1_title: data.product_1_title || undefined,
    product_2_url: data.product_2_url || undefined,
    product_2_title: data.product_2_title || undefined,
    product_3_url: data.product_3_url || undefined,
    product_3_title: data.product_3_title || undefined,
    product_4_url: data.product_4_url || undefined,
    product_4_title: data.product_4_title || undefined,
    product_5_url: data.product_5_url || undefined,
    product_5_title: data.product_5_title || undefined,
    product_6_url: data.product_6_url || undefined,
    product_6_title: data.product_6_title || undefined,
  });

  const handleGeneratePreview = async () => {
    const isValid = await form.trigger();
    if (!isValid) return;

    setGenerating(true);
    try {
      const data = form.getValues();
      const intake = formDataToIntake(data);

      // Check handle availability
      const handleAvailable = await checkHandleAvailable(intake.handle);
      if (!handleAvailable) {
        toast.error('This handle is already taken');
        setGenerating(false);
        return;
      }

      // Build the draft plan
      const result = buildDraftPlan(intake);
      if (!result.success) {
        toast.error('error' in result ? result.error : 'Failed to build plan');
        setGenerating(false);
        return;
      }

      let plan = result.plan;

      // Optionally enhance with AI bios
      if (useAICopy) {
        plan = await enhancePlanWithAIBios(plan);
      }

      setDraftPlan(plan);
      setStep(5);
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    await handleGeneratePreview();
  };

  const handleApply = async () => {
    if (!draftPlan || !user) {
      toast.error('Unable to create page');
      return;
    }

    setApplying(true);
    try {
      const result = await persistDraftPlan(draftPlan, user.id);
      if (!result.success) {
        toast.error(result.error || 'Failed to create page');
        return;
      }

      toast.success('Page created successfully!');
      navigate('/dashboard/editor');
    } catch (error) {
      console.error('Error applying plan:', error);
      toast.error('Failed to create page');
    } finally {
      setApplying(false);
    }
  };

  const handleManualSetup = () => {
    navigate('/dashboard/setup');
  };

  const stepTitles = ['Profile', 'Core Links', 'Socials', 'Content', 'Preview'];

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 max-w-3xl"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            AI Setup Assistant
          </h1>
          <p className="text-muted-foreground mt-1">
            Tell us about yourself and we'll create your perfect page
          </p>
        </div>

        {/* Progress Steps */}
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  s <= step ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {stepTitles.map((title, i) => (
              <span key={title} className={i + 1 <= step ? 'text-primary font-medium' : ''}>
                {title}
              </span>
            ))}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <AnimatePresence mode="wait">
              {/* Step 1: Profile */}
              {step === 1 && (
                <StepCard key="step1" icon={<User className="h-5 w-5 text-primary" />} title="Your Profile" description="Let's start with the basics">
                  <div className="space-y-4">
                    <FormField control={form.control} name="handle" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Handle *</FormLabel>
                        <FormControl>
                          <div className="flex items-center">
                            <span className="text-muted-foreground mr-1">@</span>
                            <Input placeholder="yourhandle" {...field} />
                          </div>
                        </FormControl>
                        <FormDescription>This will be your unique URL</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="display_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Name *</FormLabel>
                        <FormControl><Input placeholder="Your Name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="creator_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Creator Type *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select your creator type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {creatorTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="tone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Page Tone *</FormLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {toneOptions.map((tone) => (
                            <Button
                              key={tone.value}
                              type="button"
                              variant={field.value === tone.value ? 'default' : 'outline'}
                              className={`h-auto py-3 flex-col gap-0.5 ${field.value === tone.value ? 'ring-2 ring-primary' : ''}`}
                              onClick={() => field.onChange(tone.value)}
                            >
                              <span className="font-medium">{tone.label}</span>
                              <span className="text-[10px] opacity-70">{tone.description}</span>
                            </Button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="flex justify-end pt-4">
                      <Button type="button" onClick={handleNext} className="gap-2">Continue<ArrowRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </StepCard>
              )}

              {/* Step 2: Core Links */}
              {step === 2 && (
                <StepCard key="step2" icon={<Link2 className="h-5 w-5 text-primary" />} title="Core Links" description="Your most important links">
                  <div className="space-y-4">
                    <FormField control={form.control} name="personal_website_url" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Personal Website URL *</FormLabel>
                        <FormControl><Input type="url" placeholder="https://yoursite.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="primary_offer_url" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Offer URL *</FormLabel>
                        <FormControl><Input type="url" placeholder="https://shop.yoursite.com" {...field} /></FormControl>
                        <FormDescription>Your main product or service</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="creator_program_url" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Creator Program URL *</FormLabel>
                        <FormControl><Input type="url" placeholder="https://join.yoursite.com" {...field} /></FormControl>
                        <FormDescription>Where people can join your team</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={handleBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
                      <Button type="button" onClick={handleNext} className="gap-2">Continue<ArrowRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </StepCard>
              )}

              {/* Step 3: Social Links */}
              {step === 3 && (
                <StepCard key="step3" icon={<Share2 className="h-5 w-5 text-primary" />} title="Social Links" description="Add your social media profiles (optional)">
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { name: 'social_tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@you' },
                        { name: 'social_instagram', label: 'Instagram', placeholder: 'https://instagram.com/you' },
                        { name: 'social_youtube', label: 'YouTube', placeholder: 'https://youtube.com/@you' },
                        { name: 'social_facebook', label: 'Facebook', placeholder: 'https://facebook.com/you' },
                        { name: 'social_facebook_group', label: 'Facebook Group', placeholder: 'https://facebook.com/groups/...' },
                        { name: 'social_snapchat', label: 'Snapchat', placeholder: 'https://snapchat.com/add/you' },
                        { name: 'social_kick', label: 'Kick', placeholder: 'https://kick.com/you' },
                        { name: 'social_twitch', label: 'Twitch', placeholder: 'https://twitch.tv/you' },
                        { name: 'social_discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
                        { name: 'social_x', label: 'X (Twitter)', placeholder: 'https://x.com/you' },
                        { name: 'social_spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/...' },
                        { name: 'social_apple_music', label: 'Apple Music', placeholder: 'https://music.apple.com/...' },
                      ].map((social) => (
                        <FormField key={social.name} control={form.control} name={social.name as keyof FormData} render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm">{social.label}</FormLabel>
                            <FormControl><Input type="url" placeholder={social.placeholder} {...field} value={field.value || ''} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      ))}
                    </div>
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={handleBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
                      <Button type="button" onClick={handleNext} className="gap-2">Continue<ArrowRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </StepCard>
              )}

              {/* Step 4: Content & Products */}
              {step === 4 && (
                <StepCard key="step4" icon={<ImageIcon className="h-5 w-5 text-primary" />} title="Content & Products" description="Add featured content and products (optional)">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label className="text-base font-medium flex items-center gap-2"><ImageIcon className="h-4 w-4" />Featured Media (up to 3)</Label>
                      {[1, 2, 3].map((i) => (
                        <FormField key={`featured_${i}`} control={form.control} name={`featured_media_${i}` as keyof FormData} render={({ field }) => (
                          <FormItem><FormControl><Input type="url" placeholder={`Featured media URL ${i}`} {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                        )} />
                      ))}
                    </div>
                    <div className="space-y-3">
                      <Label className="text-base font-medium flex items-center gap-2"><ShoppingBag className="h-4 w-4" />Products (up to 6)</Label>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={`product_${i}`} className="flex gap-2">
                          <FormField control={form.control} name={`product_${i}_url` as keyof FormData} render={({ field }) => (
                            <FormItem className="flex-1"><FormControl><Input type="url" placeholder={`Product ${i} URL`} {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name={`product_${i}_title` as keyof FormData} render={({ field }) => (
                            <FormItem className="flex-1"><FormControl><Input placeholder="Title (optional)" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      ))}
                    </div>
                    {/* AI Copy Toggle */}
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div>
                        <p className="font-medium text-foreground text-sm">Use AI for bio copy</p>
                        <p className="text-xs text-muted-foreground">Generate creative bios based on your profile</p>
                      </div>
                      <Switch checked={useAICopy} onCheckedChange={setUseAICopy} />
                    </div>
                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={handleBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Back</Button>
                      <Button type="button" onClick={handleGeneratePreview} disabled={generating} className="gap-2">
                        {generating ? (<><Loader2 className="h-4 w-4 animate-spin" />Generating...</>) : (<><Wand2 className="h-4 w-4" />Generate Preview</>)}
                      </Button>
                    </div>
                  </div>
                </StepCard>
              )}

              {/* Step 5: Preview */}
              {step === 5 && draftPlan && (
                <StepCard key="step5" icon={<Eye className="h-5 w-5 text-primary" />} title="Your Draft Plan" description="Review your page before creating">
                  <div className="space-y-6">
                    {/* Profile & Bios */}
                    <div className="p-4 bg-secondary/30 rounded-lg space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
                          {draftPlan.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-lg text-foreground">{draftPlan.display_name}</p>
                          <p className="text-sm text-muted-foreground">@{draftPlan.handle}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Short Bio ({draftPlan.bio_short.length}/90)</p>
                          <p className="text-foreground font-medium">{draftPlan.bio_short}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Long Bio ({draftPlan.bio_long.length}/180)</p>
                          <p className="text-foreground text-sm">{draftPlan.bio_long}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap text-xs">
                        <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                          {creatorTypes.find(t => t.value === draftPlan.creator_type)?.label || draftPlan.creator_type}
                        </span>
                        <span className="px-2 py-1 bg-secondary text-foreground rounded">
                          {toneOptions.find(t => t.value === draftPlan.tone)?.label || draftPlan.tone} tone
                        </span>
                      </div>
                    </div>

                    {/* Shop Mode Blocks */}
                    <div className="space-y-3">
                      <h3 className="font-medium text-foreground flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        Shop Mode ({draftPlan.shop_mode.blocks.filter(b => b.is_enabled).length} blocks)
                      </h3>
                      {draftPlan.shop_mode.blocks.filter(b => b.is_enabled).map((block, i) => (
                        <BlockPreview key={`shop-${i}`} block={block} />
                      ))}
                    </div>

                    {/* Recruit Mode Blocks */}
                    <div className="space-y-3">
                      <h3 className="font-medium text-foreground flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Recruit Mode ({draftPlan.recruit_mode.blocks.filter(b => b.is_enabled).length} blocks)
                      </h3>
                      {draftPlan.recruit_mode.blocks.filter(b => b.is_enabled).map((block, i) => (
                        <BlockPreview key={`recruit-${i}`} block={block} />
                      ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 pt-4 border-t border-border">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button type="button" onClick={handleApply} disabled={applying} className="flex-1 gap-2">
                          {applying ? (<><Loader2 className="h-4 w-4 animate-spin" />Creating...</>) : (<><Sparkles className="h-4 w-4" />Apply & Continue</>)}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleRegenerate} disabled={generating} className="gap-2">
                          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                          Regenerate
                        </Button>
                      </div>
                      <Button type="button" variant="ghost" onClick={handleManualSetup} className="w-full gap-2 text-muted-foreground">
                        <Settings className="h-4 w-4" />
                        Switch to Manual Setup
                      </Button>
                    </div>
                  </div>
                </StepCard>
              )}
            </AnimatePresence>
          </form>
        </Form>
      </motion.div>
    </DashboardLayout>
  );
}

function BlockPreview({ block }: { block: { type: string; title: string; items: { item_key: string; label: string; url: string }[] } }) {
  return (
    <div className="p-3 border border-border rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-foreground">{block.title}</span>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{block.type}</span>
      </div>
      <div className="space-y-1">
        {block.items.map((item) => (
          <div key={item.item_key} className="flex items-center gap-2 text-sm">
            <Check className="h-3 w-3 text-green-500" />
            <span className="text-foreground truncate flex-1">{item.label}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">{icon}{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  );
}
