// EmailSubscribeBlock — form-submit block with Supabase RPC subscribe_to_page.
// Lifted from src/pages/PublicProfile.tsx line 1031 as part of Phase 3a.
//
// Declares its own custom props interface (not ThemedBlockProps) because it
// needs an optional pageId for the RPC call. No outbound-click analytics —
// this is a form submit, not a link click.
//
// Upgraded from the source: all user-facing strings are now wired through
// t() — both default config copy (title/placeholder/button/success/name) and
// the 4 error messages — matching the EditableProfileView surface and giving
// bilingual EN/ES rendering for Latino creator profiles.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { getChromeTokens, coerceLegibleText } from '@/lib/contrast';
import { fullBleedText } from '@/lib/surface';
import type { BlockWithItems } from './types';
import type { ThemeJson } from '@/lib/theme-defaults';

type CSSVarStyle = React.CSSProperties & Record<`--${string}`, string>;

interface EmailSubscribeBlockProps {
  block: BlockWithItems;
  theme: ThemeJson;
  pageId?: string;
}

export function EmailSubscribeBlock({ block, theme, pageId }: EmailSubscribeBlockProps) {
  const { t } = useLanguage();
  // ES-SWEEP.1 Task 3: stored config from the badge JSON overrides the t()
  // defaults below, so a seeded block would render its English seed values.
  // tc() routes each rendered config string through CONTENT_MAP — seeded
  // defaults translate, custom user copy passes through unchanged.
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const item = block.items[0];
  if (!item) return null;

  // Parse config
  let config = {
    title: t('emailSubscribe.defaultTitle'),
    placeholder: t('emailSubscribe.defaultPlaceholder'),
    button_label: t('emailSubscribe.defaultButton'),
    success_message: t('emailSubscribe.defaultSuccess'),
    redirect_url: '',
    collect_name: false,
    name_placeholder: t('emailSubscribe.defaultName'),
  };

  if (item.badge) {
    try {
      const parsed = JSON.parse(item.badge);
      config = { ...config, ...parsed };
      config.button_label = config.button_label || t('emailSubscribe.defaultButton');
      config.success_message = config.success_message || t('emailSubscribe.defaultSuccess');
      config.placeholder = config.placeholder || t('emailSubscribe.defaultPlaceholder');
      config.name_placeholder = config.name_placeholder || t('emailSubscribe.defaultName');
    } catch {
      // Use defaults
    }
  }

  const validateEmail = (email: string): boolean => {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pageId) {
      setError(t('emailSubscribe.errorUnable'));
      return;
    }

    if (!validateEmail(email)) {
      setError(t('emailSubscribe.errorInvalidEmail'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('subscribe_to_page', {
        p_page_id: pageId,
        p_email: email,
        p_name: config.collect_name ? name : null,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string };

      if (result.success) {
        setSuccess(true);

        // Redirect if configured
        if (config.redirect_url) {
          setTimeout(() => {
            window.location.href = config.redirect_url;
          }, 1500);
        }
      } else {
        setError(result.error || t('emailSubscribe.errorGeneric'));
      }
    } catch (err: any) {
      console.error('Subscribe error:', err);
      setError(t('emailSubscribe.errorRetry'));
    } finally {
      setLoading(false);
    }
  };

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '12px';
      case 'square': return '4px';
      default: return '12px';
    }
  };

  // TPL.5 TASK 2 (ratified: the action button follows the layout, not the
  // sanctioned brand-gold): the Subscribe button paints the layout's fill.
  // coerceLegibleText keeps the label readable on ANY theme's fill — a light
  // fill flips the text to dark — so following the layout can't produce an
  // illegible button (the guarantee the old fixed gold gave for free).
  const btnBg = theme.buttons.fill_color;
  const btnText = coerceLegibleText(theme.buttons.text_color, btnBg);

  // FS.SURFACE.1a: the Subscribe button paints the brand-gold action accent
  // (the one sanctioned solid on any page style) — a constant legible pair,
  // so the old fill_color + coerceLegibleText pairing is gone.
  //
  // Placeholders rode on `placeholder:opacity-50`, which over a photo washed the
  // text out to an unreadable grey. textMuted is the app's muted-chrome token
  // (text_color @ 0.72) — same alpha the rest of the chrome uses.
  const tokens = getChromeTokens(theme);
  const placeholderColor = tokens.textMuted;

  const inputStyle: CSSVarStyle = {
    color: theme.typography.text_color,
    borderRadius: getButtonRadius(),
    backgroundColor: tokens.surfaceStrong,
    border: `1px solid ${tokens.border}`,
    '--es-placeholder': placeholderColor,
  };

  const inputClass =
    'h-11 px-4 rounded-lg text-inherit ' +
    'placeholder:text-[color:var(--es-placeholder)] focus:outline-none focus:ring-2 focus:ring-white/30';

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-4 rounded-xl text-center"
        style={{
          backgroundColor: tokens.surfaceStrong,
          border: `1px solid ${tokens.border}`,
          borderRadius: getButtonRadius(),
        }}
      >
        <div className="flex items-center justify-center gap-2" style={{ color: tokens.text }}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: btnBg }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-medium">{tc(config.success_message)}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {config.title && (
        <p
          className="text-sm font-medium text-center"
          style={fullBleedText(theme, theme.typography.text_color)}
        >
          {tc(config.title)}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {config.collect_name && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tc(config.name_placeholder)}
            className={`w-full ${inputClass}`}
            style={inputStyle}
          />
        )}

        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder={tc(config.placeholder)}
            required
            className={`flex-1 min-w-0 ${inputClass}`}
            style={inputStyle}
          />
          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.98 }}
            className="h-11 px-5 font-medium flex items-center gap-2 flex-shrink-0 disabled:opacity-70"
            style={{
              backgroundColor: btnBg,
              color: btnText,
              borderRadius: getButtonRadius(),
            }}
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              tc(config.button_label)
            )}
          </motion.button>
        </div>

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
      </form>
    </div>
  );
}
