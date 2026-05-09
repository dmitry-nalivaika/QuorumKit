export const id = 992;
export const ids = [992,563];
export const modules = {

/***/ 3563:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isRetryable: () => (/* binding */ isRetryable),
/* harmony export */   withRetry: () => (/* binding */ withRetry)
/* harmony export */ });
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
function isRetryable(err) {
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
async function withRetry(fn, options = {}) {
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


/***/ }),

/***/ 1992:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   KIND: () => (/* binding */ KIND),
/* harmony export */   invoke: () => (/* binding */ invoke),
/* harmony export */   requiredPermissions: () => (/* binding */ requiredPermissions)
/* harmony export */ });
/* harmony import */ var _retry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3563);
/**
 * runtimes/copilot.js
 * Adapter for the Copilot (GitHub Models) runtime kind (ADR-005, ADR-003).
 *
 * Dispatches the agent's Copilot workflow file (`copilot-agent-<slug>.yml`)
 * via repository_dispatch / workflow_dispatch through the supplied client.
 * Wraps the call in the shared bounded-backoff retry helper (ADR-007 §8).
 *
 * The adapter is purely a dispatch layer — the LLM call itself happens
 * inside the dispatched GHA workflow, where the GITHUB_TOKEN is already
 * scoped via the workflow file. No secret value ever crosses this module.
 *
 * Exports:
 *   requiredPermissions      — GH Actions token scopes consumed by this kind
 *   invoke(context)          — dispatch entry point
 */



const KIND = 'copilot';

/**
 * Permissions consumed by the dispatched copilot workflow. The orchestrator
 * unions these with the scopes of every other adapter actually used at run
 * time (ADR-007 §7) when composing dispatched workflow `permissions:` blocks.
 */
const requiredPermissions = Object.freeze({
  contents: 'read',
  issues: 'write',
  'pull-requests': 'write',
  models: 'read', // GitHub Models inference
});

/**
 * Resolve the credential for a runtime entry. Returns the env var value or
 * throws { code: 'runtime-credential-missing', credential_ref } if absent.
 *
 * NEVER returns the value to a caller that logs/comments — only the dispatch
 * call uses it, and only the *name* (credential_ref) is recorded in audits.
 */
function resolveCredential(runtime, env = process.env) {
  const ref = runtime.credential_ref;
  if (!ref) {
    const e = new Error('runtime-credential-missing');
    e.code = 'runtime-credential-missing';
    e.credential_ref = '(none declared)';
    throw e;
  }
  const value = env[ref];
  if (!value) {
    const e = new Error('runtime-credential-missing');
    e.code = 'runtime-credential-missing';
    e.credential_ref = ref;
    throw e;
  }
  return value;
}

/**
 * Invoke the runtime for one step.
 *
 * @param {object} context
 * @param {object} context.client      - GitHub client with triggerWorkflow()
 * @param {string} context.owner
 * @param {string} context.repo
 * @param {string} context.agent       - agent slug (e.g. "qa-agent")
 * @param {string} context.ref         - git ref to dispatch on
 * @param {number} context.issueNumber
 * @param {string} context.runId
 * @param {string} context.step
 * @param {number} context.iteration
 * @param {object} context.runtime     - resolved runtime entry
 * @param {string} context.runtimeName
 * @param {object} [context.env]       - injectable env (for tests)
 * @returns {Promise<{ dispatched: true, retries: number, workflow: string }>}
 */
async function invoke(context) {
  const env = context.env ?? process.env;
  // Trigger credential check (throws on absence) but never expose value:
  resolveCredential(context.runtime, env);

  const workflow = `copilot-agent-${context.agent}.yml`;
  const dispatchRef = context.ref ?? 'main';
  const inputs = {
    issue_number: String(context.issueNumber),
    run_id: context.runId ?? '',
    step: context.step ?? '',
    iteration: String(context.iteration ?? 1),
    runtime: context.runtimeName ?? '',
  };

  const { retries } = await (0,_retry_js__WEBPACK_IMPORTED_MODULE_0__.withRetry)(
    () => context.client.triggerWorkflow(context.owner, context.repo, workflow, dispatchRef, inputs),
    { clock: context.clock }
  );
  return { dispatched: true, retries, workflow };
}


/***/ })

};

//# sourceMappingURL=992.index.js.map