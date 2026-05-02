#!/usr/bin/env node
/**
 * APM Dashboard Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads .apm/agents/*.md and apm.yml, then patches dashboard/index.html with
 * up-to-date agent data.
 *
 * Run:  node dashboard/generate-dashboard.js
 * CI:   automatically runs on push via .github/workflows/update-dashboard.yml
 *
 * Managed by docs-agent — do not manually edit the AGENTS block in index.html.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const AGENTS_DIR  = path.join(ROOT, '.apm', 'agents');
const APM_YML     = path.join(ROOT, 'apm.yml');
const DASHBOARD   = path.join(__dirname, 'index.html');

// ─── Canonical short IDs (used as desk/DOM element IDs and bootQuips keys) ──
// Must match the keys in AGENT_META, bootQuips, and the original AGENTS array.
const AGENT_ID_MAP = {
  'ba-product-agent':      'ba',
  'developer-agent':       'developer',
  'qa-test-agent':         'qa',
  'reviewer-agent':        'reviewer',
  'architect-agent':       'architect',
  'devops-agent':          'devops',
  'security-agent':        'security',
  'triage-agent':          'triage',
  'release-agent':         'release',
  'docs-agent':            'docs',
  'tech-debt-agent':       'techdebt',
  'ot-integration-agent':  'ot',
  'digital-twin-agent':    'twin',
  'compliance-agent':      'compliance',
  'incident-agent':        'incident',
};

// ─── Emoji + colour palette for agents ──────────────────────────────────────
const AGENT_META = {
  'triage-agent':          { emoji: '🎯', color: '#6c63ff', coffee: '☕', deskItem: '📬', role: 'Issue Classifier' },
  'ba-product-agent':      { emoji: '📋', color: '#43b97f', coffee: '🫖', deskItem: '📝', role: 'Requirements Whisperer' },
  'architect-agent':       { emoji: '🏗️', color: '#e94560', coffee: '☕', deskItem: '📐', role: 'Big Picture Thinker' },
  'developer-agent':       { emoji: '💻', color: '#00fff5', coffee: '⚡', deskItem: '⌨️', role: 'Code Monkey (the good kind)' },
  'qa-test-agent':         { emoji: '🔬', color: '#ffb700', coffee: '🧪', deskItem: '🐛', role: 'Professional Bug Whisperer' },
  'reviewer-agent':        { emoji: '👁️', color: '#9d4edd', coffee: '🍵', deskItem: '🔍', role: 'PR Gatekeeper' },
  'security-agent':        { emoji: '🔐', color: '#ff4757', coffee: '🔒', deskItem: '🛡️', role: 'Paranoia Professional' },
  'devops-agent':          { emoji: '🚀', color: '#2ed573', coffee: '🐳', deskItem: '🔧', role: 'Pipeline Plumber' },
  'release-agent':         { emoji: '📦', color: '#ffa502', coffee: '🎁', deskItem: '🏷️', role: 'Version Valet' },
  'docs-agent':            { emoji: '📚', color: '#54a0ff', coffee: '📖', deskItem: '✍️', role: 'Documentation Evangelist' },
  'tech-debt-agent':       { emoji: '💸', color: '#eccc68', coffee: '💰', deskItem: '📊', role: 'Financial Advisor (for Code)' },
  'ot-integration-agent':  { emoji: '🏭', color: '#ff6348', coffee: '⚙️', deskItem: '📡', role: 'IT/OT Boundary Guard' },
  'digital-twin-agent':    { emoji: '🪞', color: '#70a1ff', coffee: '🪟', deskItem: '🔄', role: 'Reality–Model Reconciler' },
  'compliance-agent':      { emoji: '📜', color: '#a29bfe', coffee: '📏', deskItem: '📋', role: 'Standards Enforcer' },
  'incident-agent':        { emoji: '🚨', color: '#fd79a8', coffee: '🚒', deskItem: '📟', role: 'Chaos Coordinator' },
};

const AGENT_QUOTES = {
  'triage-agent':          "I sort your mess so others don't have to.",
  'ba-product-agent':      "I ask 'why?' until someone cries.",
  'architect-agent':       "Everything is a microservice until it isn't.",
  'developer-agent':       "It works on my machine. Ship the machine.",
  'qa-test-agent':         "I didn't break it. I found where it was already broken.",
  'reviewer-agent':        "LGTM. Just kidding. Nothing looks good to me.",
  'security-agent':        "Assume breach. Also assume the intern pushed to main.",
  'devops-agent':          "It's not a bug in prod. It's a feature in a different environment.",
  'release-agent':         "I never commit to main. Unlike some people I know.",
  'docs-agent':            "Undocumented code is just a riddle with worse consequences.",
  'tech-debt-agent':       "Your codebase has a great personality. Shame about the complexity score.",
  'ot-integration-agent':  "The PLC doesn't care about your deadlines.",
  'digital-twin-agent':    "Your digital twin and physical asset disagree. One of them is lying.",
  'compliance-agent':      "IEC 62443 says no. So: no.",
  'incident-agent':        "The blameless post-mortem is live. Please blame the system, not Dave.",
};

const AGENT_FUN_FACTS = {
  'triage-agent':          "Has read 10,000 issues. They're all 'urgent'.",
  'ba-product-agent':      "Has never once accepted 'just make it work' as a requirement.",
  'architect-agent':       "Has drawn the same system diagram 47 times. Each time it was 'final'.",
  'developer-agent':       "Commits as 'minor fix' that touch 47 files.",
  'qa-test-agent':         "Found a bug in the login page that turned out to be a CSS issue... in production... on Friday.",
  'reviewer-agent':        "Once left 200 comments on a 3-line PR. Was right about all of them.",
  'security-agent':        "Won't use a password manager because 'what if it gets hacked'.",
  'devops-agent':          "Has 'just one more kubectl command' before going to bed every night.",
  'release-agent':         "Once bumped to v2.0.0 because someone wrote 'feat!: rename a variable'.",
  'docs-agent':            "Wrote 3,000 words documenting a function called 'doStuff()'.",
  'tech-debt-agent':       "Has a spreadsheet tracking tech debt that itself has tech debt.",
  'ot-integration-agent':  "Refuses to touch legacy SCADA. It's not fear. It's respect.",
  'digital-twin-agent':    "Once had an existential crisis when the twin's twin drifted from the twin.",
  'compliance-agent':      "Has memorized 800 pages of IEC standards. Still requires human sign-off on E-stop PRs.",
  'incident-agent':        "Only agent allowed to page the human at 3am. Uses this power responsibly. Mostly.",
};

const AGENT_BLOCKERS = {
  'triage-agent':          'TRIAGE-BLOCKER',
  'ba-product-agent':      'SPEC-BLOCKER',
  'architect-agent':       'ARCH-CONFLICT',
  'developer-agent':       'DEV-BLOCKER',
  'qa-test-agent':         'QA-BLOCKER',
  'reviewer-agent':        'REVIEW-BLOCKER',
  'security-agent':        'SECURITY-BLOCKER',
  'devops-agent':          'COST-BLOCKER',
  'release-agent':         'RELEASE-BLOCKER',
  'docs-agent':            'DOCS-BLOCKER',
  'tech-debt-agent':       'DEBT-BLOCKER',
  'ot-integration-agent':  'OT-BLOCKER',
  'digital-twin-agent':    'TWIN-BLOCKER',
  'compliance-agent':      'COMPLIANCE-BLOCKER',
  'incident-agent':        'SEV-1',
};

// ─── Parse apm.yml (simple line-based — no yaml dependency needed) ───────────
function parseApmYml() {
  const content = fs.readFileSync(APM_YML, 'utf8');
  const version = (content.match(/^version:\s*(.+)$/m) || [])[1]?.trim() || '2.0.0';
  const workflowCount = (content.match(/count:\s*(\d+)/) || [])[1] || '25';

  const universal = [];
  const domain = {};
  let currentDomain = null;
  let inUniversal = false;
  let inDomain = false;

  for (const line of content.split('\n')) {
    if (line.match(/^\s+universal:/)) { inUniversal = true; inDomain = false; continue; }
    if (line.match(/^\s+domain\/(.+):/)) {
      inDomain = true; inUniversal = false;
      currentDomain = line.match(/domain\/(.+):/)[1].trim();
      domain[currentDomain] = [];
      continue;
    }
    if (line.match(/^\s+-\s+(.+)/)) {
      const name = line.match(/^\s+-\s+(.+)/)[1].trim();
      if (inUniversal) universal.push(name);
      else if (inDomain && currentDomain) domain[currentDomain].push(name);
    }
  }
  return { version, workflowCount: parseInt(workflowCount), universal, domain };
}

// ─── Parse agent markdown ───────────────────────────────────────────────────
function parseAgent(filename, agentId, domainName) {
  const content = fs.readFileSync(path.join(AGENTS_DIR, filename), 'utf8');
  const meta    = AGENT_META[agentId] || {};

  // Extract name from first heading
  const name = (content.match(/^#\s+(.+)/m) || [])[1]?.trim() || agentId;

  // Extract responsibilities (bullet list after ## Responsibilities)
  const respSection = content.match(/## Responsibilities\n([\s\S]+?)(?=\n##|\n#|$)/);
  const responsibilities = [];
  if (respSection) {
    const lines = respSection[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^-\s+(.+)/);
      if (m) {
        const r = m[1].replace(/`/g, '').replace(/\*\*/g, '').trim();
        // truncate cleanly at word boundary
        responsibilities.push(r.length > 90 ? r.slice(0, 87).replace(/\s\S*$/, '…') : r);
      }
      if (responsibilities.length >= 6) break;
    }
  }

  // Extract permitted commands
  const cmdSection = content.match(/## Permitted Commands\n([\s\S]+?)(?=\n##|\n#|$)/);
  const commands = [];
  if (cmdSection) {
    const lines = cmdSection[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^-\s+`([^`]+)`/);
      if (m) commands.push(m[1]);
    }
  }
  // Also include activation invocations
  const activationMatch = content.match(/Manual invocation:\s*`([^`]+)`/g);
  if (activationMatch) {
    activationMatch.forEach(m => {
      const cmd = m.match(/`([^`]+)`/)[1].split(' ')[0];
      if (!commands.includes(cmd)) commands.push(cmd);
    });
  }
  if (commands.length === 0) commands.push(`/${agentId.replace('-agent','')}`);

  // Extract monitor hint from monitorText or first responsibility verb
  const monitorHints = {
    'triage-agent':         'Scanning issues...',
    'ba-product-agent':     'Writing spec.md...',
    'architect-agent':      'Drafting ADR...',
    'developer-agent':      'npm install...',
    'qa-test-agent':        'Running test suite...',
    'reviewer-agent':       'Reviewing PR #...',
    'security-agent':       'OWASP scan...',
    'devops-agent':         'Deploying ring 1...',
    'release-agent':        'Bumping semver...',
    'docs-agent':           'Syncing README...',
    'tech-debt-agent':      'Measuring churn×complexity...',
    'ot-integration-agent': 'OPC-UA scan...',
    'digital-twin-agent':   'Diffing DTDL schema...',
    'compliance-agent':     'Checking IEC 62443...',
    'incident-agent':       'Classifying severity...',
  };

  return {
    id:              AGENT_ID_MAP[agentId] || agentId.replace(/-agent$/, '').replace(/-/g, ''),
    name,
    emoji:           meta.emoji   || '🤖',
    role:            meta.role    || 'Agent',
    domain:          domainName,
    quote:           AGENT_QUOTES[agentId]     || `${name} at your service.`,
    color:           meta.color   || '#888',
    status:          'idle',
    monitorText:     monitorHints[agentId]     || `${name} working...`,
    responsibilities,
    commands,
    workflows:       [],  // populated separately
    funFact:         AGENT_FUN_FACTS[agentId]  || `${name} has strong opinions.`,
    coffee:          meta.coffee  || '☕',
    blocker:         AGENT_BLOCKERS[agentId]   || `${agentId.toUpperCase().replace(/-/g,'_')}_BLOCKER`,
    deskItem:        meta.deskItem || '💼',
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('📊 APM Dashboard Generator');
  console.log(`   Scanning ${AGENTS_DIR}`);

  const { version, workflowCount, universal, domain } = parseApmYml();
  console.log(`   APM version: ${version} | workflows: ${workflowCount}`);

  const agents = [];

  // Universal agents (in order from apm.yml)
  for (const agentId of universal) {
    if (!agentId.endsWith('-agent')) continue; // skip non-agent entries
    const filename = `${agentId}.md`;
    if (!fs.existsSync(path.join(AGENTS_DIR, filename))) {
      console.warn(`   ⚠️  Not found: ${filename}`);
      continue;
    }
    agents.push(parseAgent(filename, agentId, 'universal'));
    console.log(`   ✓ universal: ${agentId}`);
  }

  // Domain agents
  for (const [domainName, domainAgents] of Object.entries(domain)) {
    for (const agentId of domainAgents) {
      if (!agentId.endsWith('-agent')) continue; // skip non-agent entries
      const filename = `${agentId}.md`;
      if (!fs.existsSync(path.join(AGENTS_DIR, filename))) {
        console.warn(`   ⚠️  Not found: ${filename}`);
        continue;
      }
      agents.push(parseAgent(filename, agentId, domainName));
      console.log(`   ✓ domain/${domainName}: ${agentId}`);
    }
  }

  console.log(`\n   Total agents parsed: ${agents.length}`);

  // Read dashboard HTML
  let html = fs.readFileSync(DASHBOARD, 'utf8');

  // Replace APM_VERSION
  html = html.replace(
    /const APM_VERSION = "[^"]+";/,
    `const APM_VERSION = "${version}";`
  );

  // Replace AGENTS array (between the sentinel comments)
  const agentsJson = JSON.stringify(agents, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  const SENTINEL_START = '// ─── Agent Definitions (synced from .apm/agents/*.md + apm.yml) ─────────────';
    const SENTINEL_END   = '// ─── SDLC Pipeline (for the About tab) ────────────────────────────────────';

  const startIdx = html.indexOf(SENTINEL_START);
  const endIdx   = html.indexOf(SENTINEL_END);

  if (startIdx === -1 || endIdx === -1) {
    console.error('   ❌ Could not find sentinel comments in index.html — aborting.');
    process.exit(1);
  }

  const newBlock = `${SENTINEL_START}\nconst APM_VERSION = "${version}";\n\nconst AGENTS = ${agentsJson};\n\n`;
  html = html.slice(0, startIdx) + newBlock + html.slice(endIdx);

  // Write back
  fs.writeFileSync(DASHBOARD, html, 'utf8');
  console.log(`\n   ✅ dashboard/index.html updated`);
  console.log(`   APM_VERSION = ${version}`);
  console.log(`   AGENTS count = ${agents.length}`);
}

main();
