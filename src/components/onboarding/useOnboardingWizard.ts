import { useEffect, useReducer } from 'react';

export interface OnboardingState {
  pageStyle: 'classic' | 'hero' | 'full_bleed' | null;
  displayName: string;
  username: string;
  avatarFile: File | null;
  avatarPreview: string | null;
  backgroundColor: string;
  backgroundType: 'solid' | 'gradient';
  gradientStart: string;
  gradientEnd: string;
  buttonStyle: string;
  fontChoice: string;
  selectedSocialPlatforms: string[];
  socialIconStyle: 'color' | 'white' | 'dark';
  linkLayout: 'gallery' | 'standard' | 'featured' | null;
  linkCount: number;
  selectedPreset: string | null;
  links: Array<{ platform: string; url: string }>;
  currentStep: number;
  currentSubStep: number;
  direction: number;
  createdPageId: string | null;
  createdHandle: string | null;
}

type Action =
  | { type: 'SET_FIELD'; field: keyof OnboardingState; value: any }
  | { type: 'GO_NEXT' }
  | { type: 'GO_PREV' }
  | { type: 'GO_TO_STEP'; step: number }
  | { type: 'SET_SUB_STEP'; subStep: number; direction?: number };

const initialState: OnboardingState = {
  pageStyle: null,
  displayName: '',
  username: '',
  avatarFile: null,
  avatarPreview: null,
  backgroundColor: '#0e0c09',
  backgroundType: 'solid',
  gradientStart: '#667eea',
  gradientEnd: '#764ba2',
  buttonStyle: 'solid_rounded',
  fontChoice: 'modern',
  selectedSocialPlatforms: [],
  socialIconStyle: 'color',
  linkLayout: null,
  linkCount: 3,
  selectedPreset: null,
  links: [],
  currentStep: 1,
  currentSubStep: 0,
  direction: 1,
  createdPageId: null,
  createdHandle: null,
};

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'GO_NEXT':
      // Clamp at the last step (6) so a double-fire can never strand the
      // wizard on a step that has no render branch.
      return { ...state, currentStep: Math.min(6, state.currentStep + 1), currentSubStep: 0, direction: 1 };
    case 'GO_PREV':
      return { ...state, currentStep: Math.max(1, state.currentStep - 1), currentSubStep: 0, direction: -1 };
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.step, currentSubStep: 0, direction: action.step > state.currentStep ? 1 : -1 };
    case 'SET_SUB_STEP':
      return { ...state, currentSubStep: action.subStep, direction: action.direction ?? (action.subStep > state.currentSubStep ? 1 : -1) };
    default:
      return state;
  }
}

// Restore in-progress wizard state (per user) saved by the persistence effect.
// avatarFile is a File — not JSON-serializable — so it's always reset to null;
// the uploaded/preview URL in avatarPreview survives instead.
function loadPersisted(storageKey: string | undefined): OnboardingState {
  if (!storageKey || typeof window === 'undefined') return initialState;
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    if (!saved) return initialState;
    const parsed = JSON.parse(saved) as Partial<OnboardingState>;
    // Sanitize the restored step into the valid 1-6 range: rescues any
    // session persisted while stranded out of range.
    const restoredStep =
      typeof parsed.currentStep === 'number' && Number.isFinite(parsed.currentStep)
        ? Math.min(6, Math.max(1, Math.round(parsed.currentStep)))
        : 1;
    return { ...initialState, ...parsed, currentStep: restoredStep, avatarFile: null };
  } catch {
    return initialState;
  }
}

export function useOnboardingWizard(userId?: string) {
  const storageKey = userId ? `onboarding:${userId}` : undefined;
  const [state, dispatch] = useReducer(reducer, storageKey, loadPersisted);

  // Persist progress on every change so a mid-flow reload/remount restores the
  // exact step + selections instead of resetting to step 1 (which previously
  // stranded users on the Layout/Vibe steps with their preset lost).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const { avatarFile: _omit, ...serializable } = state;
      window.sessionStorage.setItem(storageKey, JSON.stringify(serializable));
    } catch {
      /* storage unavailable / full — non-fatal, flow still works in-memory */
    }
  }, [state, storageKey]);

  const clearPersisted = () => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };

  return {
    state,
    dispatch,
    clearPersisted,
    goNext: () => dispatch({ type: 'GO_NEXT' }),
    goPrev: () => dispatch({ type: 'GO_PREV' }),
    goToStep: (step: number) => dispatch({ type: 'GO_TO_STEP', step }),
    setSubStep: (subStep: number) => dispatch({ type: 'SET_SUB_STEP', subStep }),
    updateField: (field: keyof OnboardingState, value: any) => dispatch({ type: 'SET_FIELD', field, value }),
  };
}
