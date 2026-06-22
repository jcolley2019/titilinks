import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useOnboardingWizard } from '@/components/onboarding/useOnboardingWizard';
import { OnboardingStepIndicator } from '@/components/onboarding/OnboardingStepIndicator';
import { StepChooseStyle } from '@/components/onboarding/StepChooseStyle';
import { StepYourProfile } from '@/components/onboarding/StepYourProfile';
import { StepChoosePreset } from '@/components/onboarding/StepChoosePreset';
import { StepPickYourVibe } from '@/components/onboarding/StepPickYourVibe';
import { StepAddYourLinks } from '@/components/onboarding/StepAddYourLinks';
import { StepYoureLive } from '@/components/onboarding/StepYoureLive';
import { supabase } from '@/integrations/supabase/client';
import type { ThemeTypography } from '@/lib/theme-defaults';
import { BLOCK_PRESETS } from '@/lib/block-presets';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { state, dispatch, goNext, goPrev, updateField, setSubStep, clearPersisted } = useOnboardingWizard(user?.id);
  const resumeChecked = useRef(false);

  const stepLabels = [
    t('onboardingFlow.stepStyle'),
    t('onboardingFlow.stepProfile'),
    t('onboardingFlow.stepLayout'),
    t('onboardingFlow.stepVibe'),
    t('onboardingFlow.stepLinks'),
    t('onboardingFlow.stepLive'),
  ];

  // Resume: check if the user already has partial data (runs once).
  useEffect(() => {
    if (!user || resumeChecked.current) return;
    resumeChecked.current = true;
    // If sessionStorage already restored in-progress state (after a reload or
    // remount), it holds the correct step + selections — do NOT let the DB
    // re-derive the step and bounce the user back (this was the "redirected to
    // the beginning + stuck on Layout/Vibe" bug).
    if (state.currentStep > 1) return;
    const checkExisting = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('page_style, username, display_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.page_style) return;

      // Pre-fill what we know so the steps show the user's existing data.
      updateField('pageStyle', profile.page_style);
      if (profile.display_name) updateField('displayName', profile.display_name);
      if (profile.username) updateField('username', profile.username);
      if (profile.avatar_url) updateField('avatarPreview', profile.avatar_url);

      // Only auto-advance when the page already exists — Add Links / You're Live
      // need no earlier selections, so the user can't be stranded. For partial
      // profile data (no page yet) we leave them at step 1 with fields
      // pre-filled rather than jumping to a gated step whose local selection
      // (preset/vibe) was never restored.
      const { data: page } = await supabase
        .from('pages')
        .select('id, handle')
        .eq('user_id', user.id)
        .maybeSingle();

      if (page) {
        updateField('createdPageId', page.id);
        updateField('createdHandle', page.handle);
        dispatch({ type: 'GO_TO_STEP', step: 5 });
      }
    };
    checkExisting();
  }, [user]);

  // Step 1 save: page_style to profiles
  const handleStep1Next = async () => {
    if (!user || !state.pageStyle) return;
    try {
      await supabase.from('profiles').update({ page_style: state.pageStyle }).eq('id', user.id);
      goNext();
    } catch {
      toast.error(t('onboardingFlow.saveFailed'));
    }
  };

  // Step 2 save: display_name, username, avatar to profiles
  const handleStep2Next = async () => {
    if (!user) return;
    try {
      // Check username uniqueness against both profiles and pages
      const [{ data: profileMatch }, { data: pageMatch }] = await Promise.all([
        supabase.from('profiles').select('id').eq('username', state.username).neq('id', user.id).maybeSingle(),
        supabase.from('pages').select('id').eq('handle', state.username).maybeSingle(),
      ]);

      if (profileMatch || pageMatch) {
        toast.error(t('onboardingFlow.usernameTaken'));
        return;
      }

      // Upload avatar if file exists
      let avatarUrl = state.avatarPreview;
      if (state.avatarFile) {
        const ext = state.avatarFile.name.split('.').pop();
        const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, state.avatarFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        avatarUrl = publicUrl;
      } else if (!avatarUrl && user.user_metadata?.avatar_url) {
        avatarUrl = user.user_metadata.avatar_url;
      }

      await supabase.from('profiles').update({
        display_name: state.displayName,
        username: state.username,
        avatar_url: avatarUrl,
      }).eq('id', user.id);

      if (avatarUrl) updateField('avatarPreview', avatarUrl);
      goNext();
    } catch (err) {
      console.error('Step 2 save error:', err);
      toast.error(t('onboardingFlow.saveFailed'));
    }
  };

  const prefillBlockContent = async (shopModeId: string) => {
    try {
      const { data: allBlocks } = await supabase
        .from('blocks')
        .select('id, type, mode_id')
        .in('mode_id', [shopModeId]);

      if (!allBlocks) return;

      const shopBlocks = allBlocks.filter(b => b.mode_id === shopModeId);

      const getBlock = (blocks: typeof allBlocks, type: string) =>
        blocks.find(b => b.type === type);

      const itemsToInsert: Array<{
        block_id: string;
        label: string;
        url: string;
        subtitle?: string;
        badge?: string;
        order_index: number;
      }> = [];

      // === SHOP MODE (Page 1) ===

      // primary_cta
      const shopCta = getBlock(shopBlocks, 'primary_cta');
      if (shopCta) {
        itemsToInsert.push({
          block_id: shopCta.id,
          label: 'Shop My Collection',
          url: 'https://example.com/shop',
          subtitle: 'New arrivals every week',
          badge: 'NEW',
          order_index: 0,
        });
      }

      // social_links
      const shopSocial = getBlock(shopBlocks, 'social_links');
      if (shopSocial) {
        itemsToInsert.push(
          { block_id: shopSocial.id, label: 'TikTok', url: 'https://tiktok.com/@yourhandle', subtitle: 'Follow me on TikTok', order_index: 0 },
          { block_id: shopSocial.id, label: 'Instagram', url: 'https://instagram.com/yourhandle', subtitle: 'Follow me on Instagram', order_index: 1 },
          { block_id: shopSocial.id, label: 'YouTube', url: 'https://youtube.com/@yourhandle', subtitle: 'Subscribe to my channel', order_index: 2 },
        );
      }

      // links
      const shopLinks = getBlock(shopBlocks, 'links');
      if (shopLinks) {
        itemsToInsert.push(
          { block_id: shopLinks.id, label: 'My Website', url: 'https://example.com', subtitle: 'Check out my website', order_index: 0 },
          { block_id: shopLinks.id, label: 'Latest Blog Post', url: 'https://example.com/blog', subtitle: 'Read my latest content', order_index: 1 },
          { block_id: shopLinks.id, label: 'Work With Me', url: 'https://example.com/contact', subtitle: 'Collaborations & partnerships', badge: 'OPEN', order_index: 2 },
        );
      }

      // product_cards
      const shopProducts = getBlock(shopBlocks, 'product_cards');
      if (shopProducts) {
        itemsToInsert.push(
          { block_id: shopProducts.id, label: 'Product One', url: 'https://example.com/product-1', subtitle: 'Your best seller', badge: 'SALE', order_index: 0 },
          { block_id: shopProducts.id, label: 'Product Two', url: 'https://example.com/product-2', subtitle: 'New arrival', order_index: 1 },
          { block_id: shopProducts.id, label: 'Product Three', url: 'https://example.com/product-3', subtitle: 'Fan favorite', order_index: 2 },
        );
      }

      // Insert all items in one batch
      if (itemsToInsert.length > 0) {
        await supabase.from('block_items').insert(itemsToInsert);
      }

      // Also create missing block types for shop mode
      const missingShopTypes = ['email_subscribe', 'social_icon_row'].filter(
        type => !shopBlocks.find(b => b.type === type)
      );

      for (let i = 0; i < missingShopTypes.length; i++) {
        const type = missingShopTypes[i];
        const { data: newBlock } = await supabase
          .from('blocks')
          .insert({
            mode_id: shopModeId,
            type: type as 'email_subscribe' | 'social_icon_row',
            title: type === 'email_subscribe' ? 'Email Subscribe' : 'Social Icons',
            is_enabled: true,
            order_index: shopBlocks.length + i,
          })
          .select('id')
          .single();

        if (newBlock && type === 'email_subscribe') {
          await supabase.from('block_items').insert({
            block_id: newBlock.id,
            label: 'Stay up to date',
            url: '#',
            subtitle: 'Thanks for subscribing!',
            badge: JSON.stringify({
              title: 'Stay up to date',
              placeholder: 'your@email.com',
              button_label: 'Subscribe',
              success_message: 'Thanks for subscribing!',
              redirect_url: '',
              collect_name: false,
              name_placeholder: 'Your name',
            }),
            order_index: 0,
          });
        }

        if (newBlock && type === 'social_icon_row') {
          await supabase.from('block_items').insert([
            { block_id: newBlock.id, label: 'TikTok', url: 'https://tiktok.com/@yourhandle', order_index: 0 },
            { block_id: newBlock.id, label: 'Instagram', url: 'https://instagram.com/yourhandle', order_index: 1 },
            { block_id: newBlock.id, label: 'YouTube', url: 'https://youtube.com/@yourhandle', order_index: 2 },
          ]);
        }
      }

    } catch (error) {
      console.error('Error prefilling block content:', error);
      // Non-fatal — user can still proceed
    }
  };

  // Step 3 save: create page + modes + blocks
  const handleStep3Next = async () => {
    if (!user) return;
    try {
      // Check if page already exists
      const { data: existingPage } = await supabase
        .from('pages')
        .select('id, handle')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingPage) {
        // Update existing page theme
        await supabase.from('pages').update({
          theme_json: {
            background: {
              type: 'solid' as const,
              solid_color: state.backgroundColor || '#0e0c09',
              gradient_css: '',
              image_url: '',
              overlay_color: '#000000',
              overlay_opacity: 0.5,
              source: null,
            },
            buttonStyle: state.buttonStyle,
            typography: { font: state.fontChoice as ThemeTypography['font'], text_color: '#ffffff' },
            pageStyle: state.pageStyle,
            linkLayout: state.linkLayout,
            linkCount: state.linkCount,
          },
        }).eq('id', existingPage.id);

        updateField('createdPageId', existingPage.id);
        updateField('createdHandle', existingPage.handle);
        goNext();
        return;
      }

      // Create new page
      const { data: page, error: pageError } = await supabase.from('pages').insert({
        user_id: user.id,
        handle: state.username,
        display_name: state.displayName,
        avatar_url: state.avatarPreview || null,
        theme_json: {
          background: {
            type: 'solid' as const,
            solid_color: state.backgroundColor || '#0e0c09',
            gradient_css: '',
            image_url: '',
            overlay_color: '#000000',
            overlay_opacity: 0.5,
            source: null,
          },
          buttonStyle: state.buttonStyle,
          typography: { font: state.fontChoice as ThemeTypography['font'], text_color: '#ffffff' },
          pageStyle: state.pageStyle,
          linkLayout: state.linkLayout,
          linkCount: state.linkCount,
        },
      }).select().single();

      if (pageError) throw pageError;

      // Single page (Page 1 = shop mode). A second page is opt-in later via the
      // editor's "Second page" toggle (Pro), which creates it on demand —
      // onboarding no longer creates a second page automatically.
      const { data: modes, error: modesError } = await supabase.from('modes').insert([
        { page_id: page.id, type: 'page1' },
      ]).select();

      if (modesError) throw modesError;

      const shopMode = modes.find((m) => m.type === 'page1');

      if (shopMode) {
        // Page 1 content comes from the preset picked in the Layout step.
        // social_links is a header block (populated in the Links step), so it's
        // always present regardless of preset — matching the block-presets contract.
        const preset = BLOCK_PRESETS.find((p) => p.key === state.selectedPreset) ?? BLOCK_PRESETS[0];
        await supabase.from('blocks').insert([
          { mode_id: shopMode.id, type: 'social_links', title: 'Social Links', is_enabled: true, order_index: 0 },
          ...preset.blocks.map((b, i) => ({
            mode_id: shopMode.id,
            type: b.type,
            title: b.title,
            is_enabled: true,
            order_index: i + 1,
          })),
        ]);

        // Pre-populate Page 1 blocks with placeholder content.
        await prefillBlockContent(shopMode.id);
      }

      updateField('createdPageId', page.id);
      updateField('createdHandle', page.handle);
      goNext();
    } catch (err) {
      console.error('Step 3 save error:', err);
      toast.error(t('onboardingFlow.saveFailed'));
    }
  };

  // Step 4 save: add social link items to blocks
  const handleStep4Next = async () => {
    if (!user || !state.createdPageId) {
      goNext();
      return;
    }

    try {
      // Find shop mode's social_links block
      const { data: modes } = await supabase
        .from('modes')
        .select('id')
        .eq('page_id', state.createdPageId)
        .eq('type', 'page1');

      if (!modes || modes.length === 0) {
        goNext();
        return;
      }

      const { data: blocks } = await supabase
        .from('blocks')
        .select('id')
        .eq('mode_id', modes[0].id)
        .eq('type', 'social_links');

      if (!blocks || blocks.length === 0) {
        goNext();
        return;
      }

      const blockId = blocks[0].id;

      // Always delete existing items first to prevent duplicates
      await supabase
        .from('block_items')
        .delete()
        .eq('block_id', blockId);

      // Insert selected platforms if any
      if (state.selectedSocialPlatforms.length > 0) {
        const items = state.selectedSocialPlatforms.map((platform, i) => ({
          block_id: blockId,
          label: platform,
          url: '',
          order_index: i,
        }));
        await supabase.from('block_items').insert(items);
      }

      goNext();
    } catch (err) {
      console.error('Step 4 save error:', err);
      toast.error(t('onboardingFlow.saveFailed'));
    }
  };

  // Step 5 finish: mark onboarding complete
  const handleFinish = async () => {
    if (!user) return;
    try {
      await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', user.id);
      // Immediately update the cache so ProtectedRoute won't redirect back
      queryClient.setQueryData(['onboarding-status', user.id], { onboarding_complete: true });
      // Onboarding is done — drop the persisted wizard state so a future visit
      // (or a different account in this tab) starts clean.
      clearPersisted();
      navigate('/dashboard/editor', { replace: true });
    } catch {
      toast.error(t('onboardingFlow.saveFailed'));
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0c09] text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <span className="text-xl font-bold">
          <span className="text-white font-display">Titi</span>
          <span className="italic text-[#C9A55C] font-display">Links</span>
        </span>
        <div className="w-64">
          <OnboardingStepIndicator currentStep={state.currentStep} stepLabels={stepLabels} />
        </div>
        <div className="w-16" />
      </div>

      {/* Step content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait" custom={state.direction}>
          <motion.div
            key={state.currentStep}
            custom={state.direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {state.currentStep === 1 && (
              <StepChooseStyle state={state} updateField={updateField} onNext={handleStep1Next} t={t} />
            )}
            {state.currentStep === 2 && (
              <StepYourProfile state={state} updateField={updateField} onNext={handleStep2Next} onPrev={goPrev} user={user} t={t} />
            )}
            {state.currentStep === 3 && (
              <StepChoosePreset state={state} updateField={updateField} onNext={goNext} onPrev={goPrev} t={t} />
            )}
            {state.currentStep === 4 && (
              <StepPickYourVibe state={state} updateField={updateField} dispatch={dispatch} onNext={handleStep3Next} onPrev={goPrev} t={t} />
            )}
            {state.currentStep === 5 && (
              <StepAddYourLinks state={state} updateField={updateField} onNext={handleStep4Next} onPrev={goPrev} t={t} />
            )}
            {state.currentStep === 6 && (
              <StepYoureLive state={state} onFinish={handleFinish} t={t} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
