interface StepIndicatorProps {
  currentStep: number;
  stepLabels: string[];
}

export function OnboardingStepIndicator({ currentStep, stepLabels }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-md mx-auto">
      {stepLabels.map((label, i) => {
        const step = i + 1;
        const isCompleted = step < currentStep;
        const isActive = step === currentStep;

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  isCompleted
                    ? 'bg-[#C9A55C] text-[#0e0c09]'
                    : isActive
                      ? 'border-2 border-[#C9A55C] text-[#C9A55C]'
                      : 'border-2 border-gray-600 text-gray-600'
                }`}
              >
                {isCompleted ? '✓' : step}
              </div>
              <span
                className={`text-[10px] mt-1.5 whitespace-nowrap ${
                  isActive ? 'text-[#C9A55C] font-medium' : isCompleted ? 'text-[#C9A55C]/70' : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </div>
            {step < stepLabels.length && (
              <div
                className={`h-[2px] flex-1 mx-1 mt-[-16px] ${
                  isCompleted ? 'bg-[#C9A55C]' : 'bg-gray-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
