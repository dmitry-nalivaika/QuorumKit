export const id = 212;
export const ids = [212,563];
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

/***/ 1212:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   KIND: () => (/* binding */ KIND),
/* harmony export */   invoke: () => (/* binding */ invoke),
/* harmony export */   requiredPermissions: () => (/* binding */ requiredPermissions)
/* harmony export */ });
/* harmony import */ var _retry_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(3563);
/**
 * runtimes/claude.js
 * Adapter for the Claude (Anthropic) runtime kind (ADR-005, ADR-002).
 *
 * Dispatches the agent's Claude workflow file (`agent-<slug>.yml`) through
 * the supplied client. Mirrors copilot.js with a smaller required-permissions
 * set (no `models:` scope — Claude calls go to api.anthropic.com).
 */



const KIND = 'claude';

const requiredPermissions = Object.freeze({
  contents: 'read',
  issues: 'write',
  'pull-requests': 'write',
});

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

async function invoke(context) {
  const env = context.env ?? process.env;
  resolveCredential(context.runtime, env);

  // Workflow filename uses the bare agent slug (no `-agent` suffix):
  //   pipeline `agent: dev-agent` → `agent-dev.yml`
  const slug = context.agent.replace(/-agent$/, '');
  const workflow = `agent-${slug}.yml`;
  const dispatchRef = context.ref ?? 'main';
  // Note: agent workflows do not declare a `runtime` input; the runtime
  // *kind* is implied by which workflow is dispatched (copilot-agent-* vs
  // agent-*). Sending it would be rejected with `Unexpected inputs provided`.
  const inputs = {
    issue_number: String(context.issueNumber),
    run_id: context.runId ?? '',
    step: context.step ?? '',
    iteration: String(context.iteration ?? 1),
  };

  const { retries } = await (0,_retry_js__WEBPACK_IMPORTED_MODULE_0__.withRetry)(
    () => context.client.triggerWorkflow(context.owner, context.repo, workflow, dispatchRef, inputs),
    { clock: context.clock }
  );
  return { dispatched: true, retries, workflow };
}


/***/ })

};

//# sourceMappingURL=212.index.js.map