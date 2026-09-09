// TL.ONB.PERF.1 — the onboarding avatar upload, moved off the Continue click.
//
// PERF.0 measured step 2's Continue with a 5 MB phone photo: ~1.06 s in a
// harness where the storage POST was answered instantly, against ~0.42 s with
// no photo. In production that same POST is 2-4 s of uplink with the main
// thread idle and no frame painted — the "4 s Continue" Joey saw. The bytes are
// known the moment the user accepts the photo, so that is when they start
// moving; Continue then awaits a promise that has usually already settled.
//
// The upload itself is EXACTLY what OnboardingFlow.handleStep2Next did before —
// same bucket, same object names, same best-effort semantics for the original.
// This is a move, not a rewrite.
import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/utils';
import { originalObjectName } from '@/lib/onboarding-photo';

export interface AvatarUploadResult {
  avatarUrl: string;
  /** null when there was no original, or its best-effort upload failed. */
  avatarOriginalUrl: string | null;
}

export interface AvatarUploadHandle {
  promise: Promise<AvatarUploadResult>;
  /** Mark this upload superseded — a later pick started, so ignore its result. */
  cancel(): void;
  /** True once cancel() has been called. */
  readonly cancelled: boolean;
  /** True once the promise has settled either way (no spinner for a done upload). */
  readonly settled: boolean;
}

/**
 * Upload the display copy to `avatars/<uid>/<uuid>.<ext>` and, best effort, the
 * full-resolution original beside it. Rejects only when the DISPLAY upload
 * fails — the same throw handleStep2Next has always propagated.
 */
export function startAvatarUpload(
  userId: string,
  avatarFile: File,
  avatarOriginalFile: File | null,
): AvatarUploadHandle {
  let cancelled = false;
  let settled = false;

  const promise = (async (): Promise<AvatarUploadResult> => {
    const ext = avatarFile.name.split('.').pop();
    const filePath = `${userId}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, avatarFile);
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

    // TL.ONB.PHOTO.1 — the full-resolution original rides alongside the display
    // copy, named exactly as the editor names its originals
    // (`<uid>/<uuid>-original.<ext>`), and lands in pages.avatar_original_url
    // at the step-3 insert. Best effort: a failed original upload is logged
    // and onboarding continues — the page must never be blocked on it.
    let avatarOriginalUrl: string | null = null;
    if (avatarOriginalFile) {
      try {
        const origPath = originalObjectName(userId, randomUUID(), avatarOriginalFile.name);
        const { error: origError } = await supabase.storage.from('avatars').upload(origPath, avatarOriginalFile);
        if (origError) throw origError;
        avatarOriginalUrl = supabase.storage.from('avatars').getPublicUrl(origPath).data.publicUrl;
      } catch (origErr) {
        console.error('[ONB.PHOTO.1] original upload failed (continuing without it):', origErr);
        avatarOriginalUrl = null;
      }
    }

    return { avatarUrl: publicUrl, avatarOriginalUrl };
  })();

  // Settle-tracking doubles as the rejection handler, so a pre-upload nobody is
  // awaiting yet can never surface as an unhandled rejection. Consumers still
  // see the rejection: they await `promise`, not this branch.
  promise.then(() => { settled = true; }, () => { settled = true; });

  return {
    promise,
    cancel() { cancelled = true; },
    get cancelled() { return cancelled; },
    get settled() { return settled; },
  };
}

// ── the in-flight handle ────────────────────────────────────────────────────
// Module-level on purpose. Back REMOUNTS StepYourProfile (AnimatePresence keys
// the step), so a component ref would be dropped on every step change; and the
// two halves live in different components — the pick starts the upload in
// StepYourProfile, Continue awaits it in OnboardingFlow. Never persisted: it
// holds a live promise over a File, neither of which survives JSON.
let inFlight: AvatarUploadHandle | null = null;

/** Start an upload, superseding (cancelling) any earlier one. */
export function beginAvatarUpload(
  userId: string,
  avatarFile: File,
  avatarOriginalFile: File | null,
): AvatarUploadHandle {
  inFlight?.cancel();
  inFlight = startAvatarUpload(userId, avatarFile, avatarOriginalFile);
  return inFlight;
}

/** The upload started by the most recent pick, if any. */
export function currentAvatarUpload(): AvatarUploadHandle | null {
  return inFlight;
}
