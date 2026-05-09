import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryable } from '../orchestrator/runtimes/_retry.js';

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async ms => { t += ms; }),
  };
}

describe('runtimes/_retry.isRetryable', () => {
  it('flags 5xx and 429 as retryable', () => {
    expect(isRetryable({ status: 500 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
  });
  it('does not flag 4xx (other than 429) as retryable', () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable({ status: 404 })).toBe(false);
  });
  it('flags network errors and timeouts', () => {
    expect(isRetryable({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryable({ message: 'fetch network failure' })).toBe(true);
    expect(isRetryable({ message: 'request timeout' })).toBe(true);
  });
  it('returns false for null / undefined', () => {
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('runtimes/_retry.withRetry', () => {
  it('returns immediately on success (retries: 0)', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const r = await withRetry(fn, { clock: fakeClock() });
    expect(r).toEqual({ value: 'ok', retries: 0 });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on transient 5xx and surfaces the eventual success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValue('ok');
    const r = await withRetry(fn, { clock: fakeClock() });
    expect(r.value).toBe('ok');
    expect(r.retries).toBe(2);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting maxAttempts on persistent transient errors', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(withRetry(fn, { clock: fakeClock(), maxAttempts: 3 }))
      .rejects.toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(withRetry(fn, { clock: fakeClock() })).rejects.toMatchObject({ status: 400 });
    expect(fn).toHaveBeenCalledOnce();
  });
});
