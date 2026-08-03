#!/usr/bin/env node
/**
 * bin/quorumkit-engine.js — thin CLI dispatcher for the quorumkit-engine
 * npm package (Issue #283, AD-2).
 *
 * Usage:
 *   npx quorumkit-engine dashboard [--port <N>]
 */
'use strict';

const path = require('path');

const [, , subcommand, ...rest] = process.argv;

switch (subcommand) {
  case 'dashboard':
    // Re-slice argv so dashboard/server.js's own `--port` parsing (which
    // reads process.argv.slice(2)) sees only the dashboard-specific args.
    process.argv = [process.argv[0], process.argv[1], ...rest];
    require(path.join(__dirname, 'quorumkit-dashboard.js'));
    break;
  default:
    console.error(`quorumkit-engine: unknown command '${subcommand || ''}'`);
    console.error('Usage: quorumkit-engine dashboard [--port <N>]');
    process.exit(1);
}
