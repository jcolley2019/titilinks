import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useOnboardingWizard } from '@/components/onboarding/useOnboardingWizard';
import { OnboardingStepIndicator } from '@/components/onboarding/OnboardingStepIndicator';
import { StepChooseStyle } from '@/components/onboarding/StepChooseStyle';
import { StepYourProfile } from '@/components/onboarding/StepYourProfile';
import { StepPickYourVibe } from '@/components/onboarding/StepPickYourVibe';
import { StepButtonSize } from '@/components/onboarding/StepButtonSize';
import { StepAddYourLinks } from '@/components/onboarding/StepAddYourLinks';
import { StepYoureLive } from '@/components/onboarding/StepYoureLive';
import { supabase } from '@/integrations/supabase/client';
import { validateHandle } from '@/lib/handle-rules';
import { currentAvatarUpload, startAvatarUpload, type AvatarUploadResult } from '@/lib/onboarding-upload';
import { buildOnboardingTheme, buildPreviewPage, buildPreviewBlocks } from '@/lib/onboarding-preview';
import { useIsLgUp } from '@/hooks/use-lg-up';
import { useOnboardingPagePreview } from '@/hooks/useOnboardingPagePreview';
import { useEntitlements } from '@/hooks/useEntitlements';
import { EditorStage } from '@/components/EditorStage';
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
    state.pageStyle === 'full_bleed' ? t('onboardingFlow.stepButtons') : t('onboardingFlow.stepVibe'),
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
        dispatch({ type: 'GO_TO_STEP', step: 4 });
      }
    };
    checkExisting();
  }, [user]);

  // ONB.7a: re-entry guard — async step saves ignore repeat Continue
  // clicks until the in-flight save settles (success or failure).
  const stepSavingRef = useRef(false);

  // TL.ONB.PERF.1 — true only while Continue is actually waiting on the photo
  // upload (a pick-time upload that has already finished never sets it), so the
  // step-2 button can say so instead of looking dead.
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Step 1 save: page_style to profiles
  const handleStep1Next = async () => {
    if (!user || !state.pageStyle) return;
    if (stepSavingRef.current) return;
    stepSavingRef.current = true;
    try {
      await supabase.from('profiles').update({ page_style: state.pageStyle }).eq('id', user.id);
      goNext();
    } catch {
      toast.error(t('onboardingFlow.saveFailed'));
    } finally {
      stepSavingRef.current = false;
    }
  };

  // Step 2 save: display_name, username, avatar to profiles
  const handleStep2Next = async () => {
    if (!user) return;
    if (stepSavingRef.current) return;
    stepSavingRef.current = true;
    try {
      // TL.HANDLE.1: format + reserved floor BEFORE the uniqueness query — a
      // reserved word is unavailable no matter who else holds it, and the DB
      // CHECK would reject the write anyway (23514, no friendly message).
      const handleError = validateHandle(state.username);
      if (handleError) {
        toast.error(t(handleError === 'reserved'
          ? 'onboardingFlow.usernameReserved'
          : 'onboardingFlow.usernameFormat'));
        return;
      }

      // Check username uniqueness against both profiles and pages
      const [{ data: profileMatch }, { data: pageMatch }] = await Promise.all([
        supabase.from('profiles').select('id').eq('username', state.username).neq('id', user.id).maybeSingle(),
        supabase.from('pages').select('id').eq('handle', state.username).neq('user_id', user.id).maybeSingle(),
      ]);

      if (profileMatch || pageMatch) {
        toast.error(t('onboardingFlow.usernameTaken'));
        return;
      }

      // TL.ONB.PERF.1 — the photo was uploaded at pick time (StepYourProfile →
      // beginAvatarUpload), so this normally awaits an already-settled promise
      // instead of a fresh 2-4 s POST. The upload itself is unchanged; it lives
      // in src/lib/onboarding-upload.ts now. Two paths still upload here: a
      // resumed session (the File survived, the promise did not) and a
      // pre-upload that failed — both fall back to exactly the old behaviour,
      // including the throw that surfaces as the saveFailed toast.
      let avatarUrl = state.avatarUploadedUrl || state.avatarPreview;
      if (state.avatarFile) {
        const pending = currentAvatarUpload();
        const mustWait = !pending || !pending.settled;
        let uploaded: AvatarUploadResult | null = null;
        if (mustWait) setUploadingPhoto(true);
        try {
          if (pending) {
            try {
              uploaded = await pending.promise;
            } catch (preErr) {
              console.error('[ONB.PERF.1] pre-upload failed, retrying on Continue:', preErr);
            }
          }
          if (!uploaded) {
            uploaded = await startAvatarUpload(user.id, state.avatarFile, state.avatarOriginalFile).promise;
          }
        } finally {
          if (mustWait) setUploadingPhoto(false);
        }
        avatarUrl = uploaded.avatarUrl;
        updateField('avatarUploadedUrl', uploaded.avatarUrl);
        updateField('avatarOriginalUrl', uploaded.avatarOriginalUrl);
      } else if (!avatarUrl && user.user_metadata?.avatar_url) {
        avatarUrl = user.user_metadata.avatar_url;
      }

      await supabase.from('profiles').update({
        display_name: state.displayName,
        username: state.username,
        avatar_url: avatarUrl,
      }).eq('id', user.id);

      // TL.ONB.PERF.1 — avatarPreview is NOT swapped for the public URL here.
      // It used to be, which meant every surface showing the photo (the phone
      // preview, the ONB.10 backdrop) dropped its decoded local copy and
      // re-fetched a just-written, still-cold storage object — the delay on
      // Back. The uploaded URL rides in avatarUploadedUrl instead, and that is
      // what step 3 writes to pages.avatar_url.
      goNext();
    } catch (err) {
      console.error('Step 2 save error:', err);
      toast.error(t('onboardingFlow.saveFailed'));
    } finally {
      stepSavingRef.current = false;
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
        size?: string;
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

      // ONB.7g: social platforms are never seeded — the icon row shows
      // only what the user picks in the Links step (empty = just the
      // + circle). Placeholder handles pointing at dead URLs must not
      // ship on real pages.

      // links — full-bleed pages carry the onboarding size choice
      const shopLinks = getBlock(shopBlocks, 'links');
      if (shopLinks) {
        const linkSize = state.pageStyle === 'full_bleed' ? state.buttonSize : undefined;
        itemsToInsert.push(
          { block_id: shopLinks.id, label: 'My Website', url: 'https://example.com', subtitle: 'Check out my website', order_index: 0, size: linkSize },
          { block_id: shopLinks.id, label: 'Latest Blog Post', url: 'https://example.com/blog', subtitle: 'Read my latest content', order_index: 1, size: linkSize },
          { block_id: shopLinks.id, label: 'Work With Me', url: 'https://example.com/contact', subtitle: 'Collaborations & partnerships', badge: 'OPEN', order_index: 2, size: linkSize },
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

        // ONB.7g-b: the social_icon_row block is created EMPTY — icons
        // come only from the user's step-4 picks, never from seeded
        // placeholders.
      }

    } catch (error) {
      console.error('Error prefilling block content:', error);
      // Non-fatal — user can still proceed
    }
  };

  // Step 3 save: create page + modes + blocks
  const handleStep3Next = async () => {
    if (!user) return;
    if (stepSavingRef.current) return;
    stepSavingRef.current = true;
    try {
      // TL.ONB.STAGE.2: the theme literal lives in src/lib/onboarding-preview.ts,
      // so the desktop phone preview shows exactly what these two writes persist.
      const themeJson = buildOnboardingTheme(state);

      // Check if page already exists
      const { data: existingPage } = await supabase
        .from('pages')
        .select('id, handle')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingPage) {
        // Update existing page theme
        await supabase.from('pages').update({
          theme_json: themeJson,
        }).eq('id', existingPage.id);

        updateField('createdPageId', existingPage.id);
        updateField('createdHandle', existingPage.handle);
        goNext();
        return;
      }

      // Create new page. TL.HANDLE.1: re-check the handle at the only site that
      // actually writes pages.handle — step 2 gated it, but a user can go Back,
      // edit the field and come forward through a cached step-2 pass.
      const newHandle = state.username.trim().toLowerCase();
      const handleError = validateHandle(newHandle);
      if (handleError) {
        toast.error(t(handleError === 'reserved'
          ? 'onboardingFlow.usernameReserved'
          : 'onboardingFlow.usernameFormat'));
        dispatch({ type: 'GO_TO_STEP', step: 2 });
        return;
      }

      const { data: page, error: pageError } = await supabase.from('pages').insert({
        user_id: user.id,
        handle: newHandle,
        display_name: state.displayName,
        // TL.ONB.PERF.1 — the UPLOADED url, never avatarPreview's local data
        // URL. avatarPreview falls back in only for a photo that was never
        // picked in this session (the resume path fills it from the DB).
        avatar_url: state.avatarUploadedUrl || state.avatarPreview || null,
        // TL.ONB.PHOTO.1 — the original uploaded in step 2 (null if none / upload failed).
        avatar_original_url: state.avatarOriginalUrl || null,
        theme_json: themeJson,
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
    } finally {
      stepSavingRef.current = false;
    }
  };

  // Step 4 save: add social link items to blocks
  const handleStep4Next = async () => {
    if (!user || !state.createdPageId) {
      goNext();
      return;
    }

    if (stepSavingRef.current) return;
    stepSavingRef.current = true;
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
    } finally {
      stepSavingRef.current = false;
    }
  };

  // Step 5 finish: mark onboarding complete
  const handleFinish = async () => {
    if (!user) return;
    if (stepSavingRef.current) return;
    stepSavingRef.current = true;
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
    } finally {
      stepSavingRef.current = false;
    }
  };

  // TL.ONB.STAGE.2 — hoisted VERBATIM so the desktop branch below and the
  // untouched mobile return render the SAME nodes. Not a rewrite: the mobile
  // DOM is byte-for-byte what it was before the hoist.
  const wordmark = (
        <span className="text-xl font-bold">
          <span className="text-white font-display">Titi</span>
          <span className="italic text-[#C9A55C] font-display">Links</span>
        </span>
  );

  const stepContent = (
        <AnimatePresence mode="wait" custom={state.direction}>
          <motion.div
            className="flex-1 flex flex-col"
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
              <StepYourProfile state={state} updateField={updateField} onNext={handleStep2Next} onPrev={goPrev} user={user} t={t} uploading={uploadingPhoto} />
            )}
            {state.currentStep === 3 && (
              state.pageStyle === 'full_bleed' ? (
                <StepButtonSize state={state} updateField={updateField} onNext={handleStep3Next} onPrev={goPrev} t={t} />
              ) : (
                <StepPickYourVibe state={state} updateField={updateField} dispatch={dispatch} onNext={handleStep3Next} onPrev={goPrev} t={t} />
              )
            )}
            {state.currentStep === 4 && (
              <StepAddYourLinks state={state} updateField={updateField} onNext={handleStep4Next} onPrev={goPrev} t={t} />
            )}
            {state.currentStep === 5 && (
              <StepYoureLive state={state} onFinish={handleFinish} onPrev={goPrev} t={t} />
            )}
          </motion.div>
        </AnimatePresence>
  );

  // ── TL.ONB.STAGE.2: the desktop wizard IS the editor's stage ──
  // At >=lg the wizard renders its steps in a fixed left panel and mounts the
  // real EditorStage beside it, so what the user is composing shows in a
  // device-truthful phone from step 1. Before step 3 there is no page row, so
  // the phone renders an in-memory projection of what step 3 will create; once
  // the page exists the read-only hook swaps in the real rows.
  const isLgUp = useIsLgUp();
  const { can, showBadge } = useEntitlements();
  // PROMO.TOGGLE.1: free is always branded; paid tiers follow the owner's
  // setting — the same line the editor uses, so the preview brands identically.
  const showBranding = !can('removeBranding') || showBadge;
  const real = useOnboardingPagePreview(state.createdPageId, state.currentStep);
  const previewPage = useMemo(
    () => real.page ?? buildPreviewPage(state, user?.id ?? '', {
      name: t('onboardingFlow.previewName'),
      handle: t('onboardingFlow.previewHandle'),
    }),
    [real.page, state, user?.id, t]
  );
  const previewBlocks = useMemo(
    () => (real.page ? real.blocks : buildPreviewBlocks(state)),
    [real.page, real.blocks, state]
  );

  if (isLgUp) {
    return (
      <div data-testid="onboarding-desktop" className="relative min-h-screen bg-[#0e0c09] text-white">
        <aside data-testid="onboarding-panel" className="fixed top-0 bottom-0 left-0 z-20 flex w-[560px] flex-col border-r border-white/5 bg-[#0e0c09]">
          <div className="flex items-center gap-4 border-b border-white/5 px-6 py-4">
            {wordmark}
            <span data-testid="onboarding-title" className="text-xs uppercase tracking-[0.2em] text-white/60">{t('onboardingFlow.stageLabel')}</span>
          </div>
          <div className="border-b border-white/5 px-6 py-4">
            <OnboardingStepIndicator currentStep={state.currentStep} stepLabels={stepLabels} />
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto px-8 pb-8 pt-8">{stepContent}</div>
        </aside>
        <EditorStage
          leftClass="left-[560px]"
          chrome={{ label: t('onboardingFlow.stageLabel'), modeToggle: false, handle: false, editProfile: false, viewLive: false }}
          initialMode="visitor"
          page={previewPage}
          editBlocks={previewBlocks}
          visitorBlocks={previewBlocks}
          showBranding={showBranding}
          selectedMode="page1"
          onModeChange={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen bg-[#0e0c09] text-white flex flex-col">
      {/* ONB.10: live page preview — once a photo is picked, the wizard
          backdrop becomes the page being built, per chosen style. */}
      {state.avatarPreview && state.currentStep >= 2 && (
        state.pageStyle === 'full_bleed' ? (
          <div aria-hidden="true" className="fixed inset-0 -z-10">
            <img src={state.avatarPreview} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.75) 100%)' }} />
          </div>
        ) : (
          <div aria-hidden="true" className="fixed top-0 inset-x-0 -z-10" style={{ height: 'min(calc(50dvh + 60px), 560px)' }}>
            <img src={state.avatarPreview} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(14,12,9,0.15) 0%, rgba(14,12,9,0.35) 55%, #0e0c09 100%)' }} />
          </div>
        )
      )}
      {/* Top bar */}
      <div className="relative z-[60] flex items-center justify-between px-6 py-4 border-b border-white/5">
        {wordmark}
        <div className="w-64">
          <OnboardingStepIndicator currentStep={state.currentStep} stepLabels={stepLabels} />
        </div>
        <div className="w-16" />
      </div>

      {/* Step content */}
      <div className="w-full max-w-3xl mx-auto px-6 pt-12 flex-1 flex flex-col">
        {stepContent}
      </div>
    </div>
  );
}
