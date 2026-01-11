import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ShieldAlert } from 'lucide-react';

const ADULT_CONSENT_KEY = 'adult_content_consent';

export function hasAdultConsent(): boolean {
  try {
    return localStorage.getItem(ADULT_CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAdultConsent(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(ADULT_CONSENT_KEY, 'true');
    } else {
      localStorage.removeItem(ADULT_CONSENT_KEY);
    }
  } catch {
    // localStorage not available
  }
}

interface AdultContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AdultContentDialog({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: AdultContentDialogProps) {
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleConfirm = () => {
    if (rememberChoice) {
      setAdultConsent(true);
    }
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <AlertDialogTitle className="text-center">
            Adult Content Warning
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            This link may contain adult content (18+). Confirm you are 18 years or older to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="remember"
            checked={rememberChoice}
            onCheckedChange={(checked) => setRememberChoice(checked === true)}
          />
          <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
            Remember my choice on this device
          </Label>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={handleCancel} className="w-full sm:w-auto">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} className="w-full sm:w-auto">
            I am 18+, Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}