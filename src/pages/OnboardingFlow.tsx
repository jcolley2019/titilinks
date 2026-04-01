import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useOnboardingWizard } from '@/components/onboarding/useOnboardingWizard';
import { OnboardingStepIndicator } from '@/components/onboarding/OnboardingStepIndicator';
import { StepChooseStyle } from '@/components/onboarding/StepChooseStyle';
import { StepYourProfile } from '@/components/onboarding/StepYourProfile';
import { StepPickYourVibe } from '@/components/onboarding/StepPickYourVibe';
import { StepAddYourLinks } from '@/components/onboarding/StepAddYourLinks';
import { StepYoureLive } from '@/components/onboarding/StepYoureLive';
import { supabase } from '@/integrations/supabase/client';
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
  const { state, dispatch, goNext, goPrev, updateField, setSubStep } = useOnboardingWizard();
  const resumeChecked = useRef(false);

  const stepLabels = [
    t('onboardingFlow.stepStyle'),
    t('onboardingFlow.stepProfile'),
    t('onboardingFlow.stepVibe'),
    t('onboardingFlow.stepLinks'),
    t('onboardingFlow.stepLive'),
  ];

  // Resume: check if user already has partial data (runs once)
  useEffect(() => {
    if (!user || resumeChecked.current) return;
    resumeChecked.current = true;
    const checkExisting = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('page_style, username, display_name, avatar_url')
        .eq('id', user.id)
        .single();

      if (profile?.page_style) {
        updateField('pageStyle', profile.page_style);
        if (profile.display_name) updateField('displayName', profile.display_name);
        if (profile.username) updateField('username', profile.username);
        if (profile.avatar_url) updateField('avatarPreview', profile.avatar_url);

        // Check if page already exists
        const { data: page } = await supabase
          .from('pages')
          .select('id, handle')
          .eq('user_id', user.id)
          .maybeSingle();

        if (page) {
          updateField('createdPageId', page.id);
          updateField('createdHandle', page.handle);
          dispatch({ type: 'GO_TO_STEP', step: 4 });
        } else if (profile.username) {
          dispatch({ type: 'GO_TO_STEP', step: 3 });
        } else {
          dispatch({ type: 'GO_TO_STEP', step: 2 });
        }
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
            background: state.backgroundColor,
            buttonStyle: state.buttonStyle,
            font: state.fontChoice,
            pageStyle: state.pageStyle,
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
          background: state.backgroundColor,
          buttonStyle: state.buttonStyle,
          font: state.fontChoice,
          pageStyle: state.pageStyle,
        },
      }).select().single();

      if (pageError) throw pageError;

      // Create modes
      const { data: modes, error: modesError } = await supabase.from('modes').insert([
        { page_id: page.id, type: 'shop' },
        { page_id: page.id, type: 'recruit' },
      ]).select();

      if (modesError) throw modesError;

      const shopMode = modes.find((m) => m.type === 'shop');
      const recruitMode = modes.find((m) => m.type === 'recruit');

      if (shopMode) {
        await supabase.from('blocks').insert([
          { mode_id: shopMode.id, type: 'primary_cta', title: 'Primary CTA', is_enabled: true, order_index: 0 },
          { mode_id: shopMode.id, type: 'product_cards', title: 'Products', is_enabled: true, order_index: 1 },
          { mode_id: shopMode.id, type: 'social_links', title: 'Social Links', is_enabled: true, order_index: 2 },
          { mode_id: shopMode.id, type: 'links', title: 'Links', is_enabled: true, order_index: 3 },
        ]);
      }

      if (recruitMode) {
        await supabase.from('blocks').insert([
          { mode_id: recruitMode.id, type: 'primary_cta', title: 'Primary CTA', is_enabled: true, order_index: 0 },
          { mode_id: recruitMode.id, type: 'featured_media', title: 'Featured Media', is_enabled: true, order_index: 1 },
          { mode_id: recruitMode.id, type: 'social_links', title: 'Social Links', is_enabled: true, order_index: 2 },
          { mode_id: recruitMode.id, type: 'links', title: 'Links', is_enabled: true, order_index: 3 },
        ]);
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
      const filledLinks = state.links.filter((l) => l.url.trim() !== '');
      if (filledLinks.length === 0) {
        goNext();
        return;
      }

      // Find the social_links block for shop mode
      const { data: modes } = await supabase
        .from('modes')
        .select('id')
        .eq('page_id', state.createdPageId)
        .eq('type', 'shop');

      if (modes && modes.length > 0) {
        const { data: blocks } = await supabase
          .from('blocks')
          .select('id')
          .eq('mode_id', modes[0].id)
          .eq('type', 'social_links');

        if (blocks && blocks.length > 0) {
          const items = filledLinks.map((link, i) => ({
            block_id: blocks[0].id,
            label: link.platform,
            url: link.url,
            order_index: i,
          }));

          await supabase.from('block_items').insert(items);
        }
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
              <StepPickYourVibe state={state} updateField={updateField} dispatch={dispatch} onNext={handleStep3Next} onPrev={goPrev} t={t} />
            )}
            {state.currentStep === 4 && (
              <StepAddYourLinks state={state} updateField={updateField} onNext={handleStep4Next} onPrev={goPrev} t={t} />
            )}
            {state.currentStep === 5 && (
              <StepYoureLive state={state} onFinish={handleFinish} t={t} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
