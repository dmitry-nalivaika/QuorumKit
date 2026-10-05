#!/usr/bin/env node
/**
 * generate-agent-inventory.js
 * 
 * Generates docs/AGENT_INVENTORY.md from scattered agent artifacts.
 * 
 * Usage: node scripts/generate-agent-inventory.js
 * 
 * Scans:
 * - src/agents/*.md (agent definitions)
 * - src/.github/instructions/*.instructions.md (Copilot instructions)
 * - src/.github/prompts/*.prompt.md (agent prompts)
 * - src/skills/[slug]/SKILL.md (agent skills)
 * - .github/workflows/agent-[slug].yml (Claude workflows)
 * - .github/workflows/copilot-agent-[slug].yml (Copilot workflows)
 * - src/agent-identities.yml (identity → agent mappings)
 * - src/runtimes.yml (runtime configuration)
 * - src/pipelines/*.yml (pipeline → agent usage)
 * 
 * Outputs:
 * - docs/AGENT_INVENTORY.md (markdown table)
 * 
 * Related:
 * - Issue #359
 * - specs/359-agent-inventory-and-invocation-docs/spec.md
 * - specs/359-agent-inventory-and-invocation-docs/plan.md
 */

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import yaml from '../engine/orchestrator/node_modules/js-yaml/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ============================================================================
// Slug Mapping Heuristic (matches src/scripts/init.sh lines 195-207)
// ============================================================================

/**
 * Map agent definition filename to canonical slug.
 * Handles known naming quirks:
 * - ba-product-agent.md → ba-agent
 * - developer-agent.md → dev-agent
 * - qa-test-agent.md → qa-agent
 * - everything else: strip .md suffix, keep as-is
 */
function slugFromDefinitionFilename(filename) {
  const base = filename.replace(/\.md$/, '');
  const mapping = {
    'ba-product-agent': 'ba-agent',
    'developer-agent': 'dev-agent',
    'qa-test-agent': 'qa-agent',
  };
  return mapping[base] || base;
}

/**
 * Map agent slug to expected definition filename.
 * Reverse of slugFromDefinitionFilename for known quirks.
 */
function definitionFilenameFromSlug(slug) {
  const reverseMapping = {
    'ba-agent': 'ba-product-agent.md',
    'dev-agent': 'developer-agent.md',
    'qa-agent': 'qa-test-agent.md',
  };
  return reverseMapping[slug] || `${slug}.md`;
}

/**
 * Map agent slug to expected instruction filename.
 * Instructions follow the short-form convention (ba-agent.instructions.md).
 */
function instructionFilenameFromSlug(slug) {
  return `${slug}.instructions.md`;
}

/**
 * Map agent slug to expected prompt filename.
 * Prompts use the long-form agent definition name.
 */
function promptFilenameFromSlug(slug) {
  const longFormMapping = {
    'ba-agent': 'ba-product-agent.prompt.md',
    'dev-agent': 'developer-agent.prompt.md',
    'qa-agent': 'qa-test-agent.prompt.md',
  };
  return longFormMapping[slug] || `${slug}.prompt.md`;
}

/**
 * Map agent slug to expected workflow basename (without agent- or copilot-agent- prefix).
 * Most slugs strip the -agent suffix, but some have additional mappings.
 */
function workflowBasenameFromSlug(slug) {
  // Strip -agent suffix if present
  let base = slug.replace(/-agent$/, '');
  
  // Handle special cases
  const mapping = {
    'ba-agent': 'ba',
    'dev-agent': 'dev',
    'qa-agent': 'qa',
    'ba-enrich-agent': 'ba-enrich',
  };
  
  return mapping[slug] || base;
}

// ============================================================================
// YAML Parsing
// ============================================================================

/**
 * Load and parse a YAML file using js-yaml.
 * Returns empty object on error (graceful degradation).
 */
function loadYAML(path) {
  try {
    if (!existsSync(path)) return {};
    const content = readFileSync(path, 'utf8');
    return yaml.load(content) || {};
  } catch (err) {
    console.warn(`Failed to load ${path}: ${err.message}`);
    return {};
  }
}

// ============================================================================
// Data Collection
// ============================================================================

/**
 * Discover all agent slugs from multiple sources.
 * Returns only CANONICAL slugs (after mapping).
 */
function discoverAgentSlugs() {
  const slugs = new Set();

  // Source 1: quorumkit.yml (official agent list) - apply mapping to ensure canonical
  const quorumkit = loadYAML(join(ROOT, 'quorumkit.yml'));
  if (quorumkit.agents) {
    if (quorumkit.agents.universal) {
      quorumkit.agents.universal.forEach(a => {
        // Apply slug mapping in case quorumkit.yml uses long-form names
        const canonical = slugFromDefinitionFilename(`${a}.md`);
        slugs.add(canonical);
      });
    }
    if (quorumkit.agents['domain/industrial']) {
      quorumkit.agents['domain/industrial'].forEach(a => {
        const canonical = slugFromDefinitionFilename(`${a}.md`);
        slugs.add(canonical);
      });
    }
  }

  // Source 2: src/agents/*.md (agent definition files) - apply mapping
  const agentsDir = join(ROOT, 'src/agents');
  if (existsSync(agentsDir)) {
    readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .forEach(f => {
        const slug = slugFromDefinitionFilename(f);
        slugs.add(slug);
      });
  }

  // Source 3: src/agent-identities.yml (identity mappings) - already canonical
  const identities = loadYAML(join(ROOT, 'src/agent-identities.yml'));
  if (identities.identities && Array.isArray(identities.identities)) {
    identities.identities.forEach(entry => {
      if (entry.agent) slugs.add(entry.agent);
    });
  }

  // Source 4: src/runtimes.yml (agent_defaults keys) - already canonical
  const runtimes = loadYAML(join(ROOT, 'src/runtimes.yml'));
  if (runtimes.agent_defaults) {
    Object.keys(runtimes.agent_defaults).forEach(slug => slugs.add(slug));
  }

  // Source 5: src/pipelines/*.yml (pipeline step agent references) - already canonical
  const pipelinesDir = join(ROOT, 'src/pipelines');
  if (existsSync(pipelinesDir)) {
    readdirSync(pipelinesDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
      .forEach(f => {
        const pipeline = loadYAML(join(pipelinesDir, f));
        if (pipeline.steps && Array.isArray(pipeline.steps)) {
          pipeline.steps.forEach(step => {
            if (step.agent) slugs.add(step.agent);
          });
        }
      });
  }

  return Array.from(slugs).sort();
}

/**
 * Check if a file exists and return its relative path or a marker.
 */
function checkArtifact(relPath) {
  const fullPath = join(ROOT, relPath);
  if (existsSync(fullPath)) {
    return { exists: true, path: relPath };
  }
  return { exists: false, path: null };
}

/**
 * Get identity logins for an agent slug.
 */
function getIdentityLogins(slug) {
  const identities = loadYAML(join(ROOT, 'src/agent-identities.yml'));
  if (!identities.identities || !Array.isArray(identities.identities)) return [];
  
  const entry = identities.identities.find(e => e.agent === slug);
  if (!entry || !entry.logins) return [];
  
  return Array.isArray(entry.logins) ? entry.logins : [];
}

/**
 * Get default runtime for an agent slug.
 */
function getDefaultRuntime(slug) {
  const runtimes = loadYAML(join(ROOT, 'src/runtimes.yml'));

  // Check agent_defaults first
  if (runtimes.agent_defaults && runtimes.agent_defaults[slug]) {
    const runtime = runtimes.agent_defaults[slug];
    // Strip inline comments
    return typeof runtime === 'string' ? runtime.split('#')[0].trim() : runtime;
  }

  // Fall back to default_runtime
  const defaultRuntime = runtimes.default_runtime || 'copilot-default';
  return typeof defaultRuntime === 'string' ? defaultRuntime.split('#')[0].trim() : defaultRuntime;
}

/**
 * Get pipeline usage for an agent slug.
 */
function getPipelineUsage(slug) {
  const pipelinesDir = join(ROOT, 'src/pipelines');
  if (!existsSync(pipelinesDir)) return [];
  
  const usage = [];
  
  readdirSync(pipelinesDir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    .forEach(f => {
      const pipeline = loadYAML(join(pipelinesDir, f));
      if (pipeline.steps && Array.isArray(pipeline.steps)) {
        const steps = pipeline.steps
          .filter(step => step.agent === slug)
          .map(step => step.name);
        
        if (steps.length > 0) {
          const pipelineName = pipeline.name || f.replace(/\.ya?ml$/, '');
          usage.push({ pipeline: pipelineName, steps });
        }
      }
    });
  
  return usage;
}

/**
 * Build complete inventory data for an agent slug.
 */
function buildAgentInventory(slug) {
  const definitionFile = definitionFilenameFromSlug(slug);
  const instructionFile = instructionFilenameFromSlug(slug);
  const promptFile = promptFilenameFromSlug(slug);
  const workflowBase = workflowBasenameFromSlug(slug);
  
  return {
    slug,
    definition: checkArtifact(`src/agents/${definitionFile}`),
    instruction: checkArtifact(`src/.github/instructions/${instructionFile}`),
    prompt: checkArtifact(`src/.github/prompts/${promptFile}`),
    skill: checkArtifact(`src/skills/${slug}/SKILL.md`),
    claudeWorkflow: checkArtifact(`.github/workflows/agent-${workflowBase}.yml`),
    copilotWorkflow: checkArtifact(`.github/workflows/copilot-agent-${workflowBase}.yml`),
    identityLogins: getIdentityLogins(slug),
    defaultRuntime: getDefaultRuntime(slug),
    pipelineUsage: getPipelineUsage(slug),
  };
}

// ============================================================================
// Markdown Rendering
// ============================================================================

/**
 * Format a path cell for the markdown table.
 */
function formatPathCell(artifact) {
  if (!artifact.exists) return '❌ MISSING';
  return `✅ [${basename(artifact.path)}](../${artifact.path})`;
}

/**
 * Format identity logins cell.
 */
function formatLoginsCell(logins) {
  if (!logins || logins.length === 0) return 'N/A';
  return logins.map(l => `\`${l}\``).join(', ');
}

/**
 * Format pipeline usage cell.
 */
function formatPipelineUsageCell(usage) {
  if (!usage || usage.length === 0) return 'N/A';
  return usage.map(u => `${u.pipeline} (${u.steps.join(', ')})`).join('; ');
}

/**
 * Render the complete inventory table as markdown.
 */
function renderInventoryTable(inventories) {
  const timestamp = new Date().toISOString();
  
  let md = `# QuorumKit Agent Inventory\n\n`;
  md += `> **Auto-generated** by \`scripts/generate-agent-inventory.js\`. Do not edit manually.\n`;
  md += `> Last updated: ${timestamp}\n\n`;
  md += `This table shows all QuorumKit agents and their associated artifacts.\n\n`;
  
  // Table header
  md += `| Agent Slug | Definition | Instruction | Prompt | Skill | Claude Workflow | Copilot Workflow | Identity Logins | Default Runtime | Pipeline Usage |\n`;
  md += `|------------|------------|-------------|--------|-------|-----------------|------------------|-----------------|-----------------|----------------|\n`;
  
  // Table rows
  inventories.forEach(inv => {
    md += `| ${inv.slug} `;
    md += `| ${formatPathCell(inv.definition)} `;
    md += `| ${formatPathCell(inv.instruction)} `;
    md += `| ${formatPathCell(inv.prompt)} `;
    md += `| ${formatPathCell(inv.skill)} `;
    md += `| ${formatPathCell(inv.claudeWorkflow)} `;
    md += `| ${formatPathCell(inv.copilotWorkflow)} `;
    md += `| ${formatLoginsCell(inv.identityLogins)} `;
    md += `| \`${inv.defaultRuntime}\` `;
    md += `| ${formatPipelineUsageCell(inv.pipelineUsage)} |\n`;
  });
  
  md += `\n---\n\n`;
  md += `## Legend\n\n`;
  md += `- ✅ File exists (click link to view)\n`;
  md += `- ❌ MISSING: File does not exist (may need to be created)\n`;
  md += `- N/A: Not applicable (agent doesn't use this artifact type)\n\n`;
  md += `## Naming Conventions\n\n`;
  md += `Agent slugs may differ from filenames due to historical naming:\n\n`;
  md += `- \`ba-agent\` → definition: \`ba-product-agent.md\`, instruction: \`ba-agent.instructions.md\`\n`;
  md += `- \`dev-agent\` → definition: \`developer-agent.md\`, instruction: \`dev-agent.instructions.md\`\n`;
  md += `- \`qa-agent\` → definition: \`qa-test-agent.md\`, instruction: \`qa-agent.instructions.md\`\n\n`;
  md += `These mappings are handled automatically by the generator script.\n\n`;
  md += `## Testing Agents\n\n`;
  md += `To test agent workflows with Azure AI Foundry or other runtimes, see:\n\n`;
  md += `**[Complete Workflow Simulation Guide](../specs/359-agent-inventory-and-invocation-docs/ALL_WORKFLOWS_SIMULATION.md)**\n\n`;
  md += `Includes step-by-step testing instructions, verification procedures, and troubleshooting for all 11 agent workflows.\n`;
  
  return md;
}

// ============================================================================
// Main
// ============================================================================

function main() {
  console.log('🔍 Discovering agent slugs...');
  const slugs = discoverAgentSlugs();
  console.log(`   Found ${slugs.length} agents: ${slugs.join(', ')}\n`);
  
  console.log('📦 Building inventory data...');
  const inventories = slugs.map(buildAgentInventory);
  console.log(`   Processed ${inventories.length} agents\n`);
  
  console.log('📝 Rendering markdown table...');
  const markdown = renderInventoryTable(inventories);
  
  const outputPath = join(ROOT, 'docs/AGENT_INVENTORY.md');
  writeFileSync(outputPath, markdown, 'utf8');
  console.log(`✅ Inventory written to: ${outputPath}\n`);
  
  // Report warnings for missing artifacts
  const warnings = [];
  inventories.forEach(inv => {
    if (!inv.definition.exists) warnings.push(`${inv.slug}: missing definition`);
    if (!inv.instruction.exists) warnings.push(`${inv.slug}: missing instruction`);
    if (!inv.claudeWorkflow.exists && !inv.copilotWorkflow.exists) {
      warnings.push(`${inv.slug}: missing both Claude and Copilot workflows`);
    }
  });
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`   - ${w}`));
    console.log();
  }
  
  console.log('🎉 Done!');
}

main();
