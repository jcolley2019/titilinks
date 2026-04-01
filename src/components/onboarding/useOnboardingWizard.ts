import { useReducer } from 'react';

export interface OnboardingState {
  pageStyle: 'classic' | 'hero' | 'full_bleed' | null;
  displayName: string;
  username: string;
  avatarFile: File | null;
  avatarPreview: string | null;
  backgroundColor: string;
  buttonStyle: string;
  fontChoice: string;
  selectedSocialPlatforms: string[];
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
  | { type: 'SET_SUB_STEP'; subStep: number };

const initialState: OnboardingState = {
  pageStyle: null,
  displayName: '',
  username: '',
  avatarFile: null,
  avatarPreview: null,
  backgroundColor: '#0e0c09',
  buttonStyle: 'solid_rounded',
  fontChoice: 'modern',
  selectedSocialPlatforms: [],
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
      return { ...state, currentStep: state.currentStep + 1, currentSubStep: 0, direction: 1 };
    case 'GO_PREV':
      return { ...state, currentStep: Math.max(1, state.currentStep - 1), currentSubStep: 0, direction: -1 };
    case 'GO_TO_STEP':
      return { ...state, currentStep: action.step, currentSubStep: 0, direction: action.step > state.currentStep ? 1 : -1 };
    case 'SET_SUB_STEP':
      return { ...state, currentSubStep: action.subStep };
    default:
      return state;
  }
}

export function useOnboardingWizard() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return {
    state,
    dispatch,
    goNext: () => dispatch({ type: 'GO_NEXT' }),
    goPrev: () => dispatch({ type: 'GO_PREV' }),
    goToStep: (step: number) => dispatch({ type: 'GO_TO_STEP', step }),
    setSubStep: (subStep: number) => dispatch({ type: 'SET_SUB_STEP', subStep }),
    updateField: (field: keyof OnboardingState, value: any) => dispatch({ type: 'SET_FIELD', field, value }),
  };
}
