/**
 * runtimes/_retry.js
 * Bounded exponential-backoff retry helper shared by all runtime adapters
 * (ADR-007 §8, FR-030).
 *
 * Policy (defaults): 3 attempts, base 2 s, jitter ±25 %, max wait 30 s total.
 * Retries are triggered by network errors, HTTP 5xx, and HTTP 429 (rate-limit).
 * Non-retryable errors are rethrown immediately.
 *
 * Returns the function's resolved value plus the number of retries used,
 * so the caller can record `runtime_retries` in the audit comment without
 * counting the invocation as a separate loop-budget iteration.
 */

const DEFAULT_OPTS = Object.freeze({
  maxAttempts: 3,
  baseMs: 2_000,
  maxTotalMs: 30_000,
  jitter: 0.25,
});

/**
 * Determine whether an error is retryable.
 * @param {any} err
 * @returns {boolean}
 */
export function isRetryable(err) {
  if (!err) return false;
  // Octokit / fetch error styles
  if (err.status === 429) return true;
  if (typeof err.status === 'number' && err.status >= 500 && err.status < 600) return true;
  // Node fetch network errors
  const code = err.code ?? err.cause?.code;
  if (code && /^(ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|UND_ERR_SOCKET)$/.test(code)) return true;
  if (typeof err.message === 'string' && /timeout|network/i.test(err.message)) return true;
  return false;
}

/**
 * Run `fn` with bounded exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [options]
 * @param {object} [options.clock] - injectable clock { now(): number, sleep(ms): Promise<void> }
 * @returns {Promise<{ value: T, retries: number }>}
 */
export async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTS, ...options };
  const clock = options.clock ?? defaultClock;

  const start = clock.now();
  let attempt = 0;
  let lastError;

  while (attempt < opts.maxAttempts) {
    try {
      const value = await fn();
      return { value, retries: attempt };
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (!isRetryable(err) || attempt >= opts.maxAttempts) break;

      const elapsed = clock.now() - start;
      if (elapsed >= opts.maxTotalMs) break;

      const exp = Math.pow(2, attempt - 1) * opts.baseMs;
      const jitter = exp * opts.jitter * (Math.random() * 2 - 1);
      const wait = Math.max(0, Math.min(exp + jitter, opts.maxTotalMs - elapsed));
      await clock.sleep(wait);
    }
  }

  throw lastError;
}

const defaultClock = {
  now: () => Date.now(),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
};
