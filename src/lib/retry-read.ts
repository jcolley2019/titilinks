/**
 * FRAGILE.PUB.1 — a read that can be retried and time-limited.
 *
 * A failed read is not an answer. The public page used to treat any error as
 * "this page does not exist" (audit P1) and fell back to Free on any plan
 * lookup error with no time limit (audit P2). This helper is the one place
 * that turns "one bad request" into "tried N times, here is the last error",
 * so callers can tell a real empty result (`error === null`, `data` empty)
 * apart from a read that never got an answer (`error !== null`).
 *
 * `run` receives an AbortSignal and must hand it to the request (supabase-js:
 * `.abortSignal(signal)`), so a stalled attempt is actually cancelled when its
 * time is up. An outer `signal` aborts the current attempt and stops retrying.
 */
export interface RetryReadOptions {
  /** Total tries, first one included. */
  attempts: number;
  /** Wait before retry n is `backoffMs * 2^(n-1)`. */
  backoffMs?: number;
  /** Per-attempt limit; an attempt still pending then is aborted and counts as failed. */
  attemptTimeoutMs?: number;
  /** Caller's own deadline / cancellation. */
  signal?: AbortSignal;
}

export interface RetryReadResult<T> {
  data: T | null;
  /** null only when an attempt came back without an error. */
  error: unknown;
}

const abortedError = () => new Error('retryRead: aborted');

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

export async function retryRead<T>(
  run: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>,
  { attempts, backoffMs = 400, attemptTimeoutMs, signal }: RetryReadOptions,
): Promise<RetryReadResult<T>> {
  let lastError: unknown = abortedError();
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(backoffMs * 2 ** (attempt - 1), signal);
    if (signal?.aborted) return { data: null, error: lastError };

    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = attemptTimeoutMs ? setTimeout(abort, attemptTimeoutMs) : undefined;
    try {
      // Race the request against its own abort, so a request that ignores the
      // signal still cannot hold the caller past its time.
      const aborted = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(abortedError());
        controller.signal.addEventListener('abort', () => reject(abortedError()), { once: true });
      });
      const request = Promise.resolve(run(controller.signal));
      request.catch(() => {}); // a late rejection after the race is lost must not surface as unhandled
      const { data, error } = await Promise.race([request, aborted]);
      if (!error) return { data, error: null };
      lastError = error;
    } catch (err) {
      lastError = err;
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return { data: null, error: lastError };
}
