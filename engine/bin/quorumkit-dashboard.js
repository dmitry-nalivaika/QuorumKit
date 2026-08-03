#!/usr/bin/env node
/**
 * bin/quorumkit-dashboard.js — npm-packaged CLI entry point for the
 * QuorumKit dashboard server (Issue #283, AD-2).
 *
 * Resolves the consumer project directory from process.cwd() (unless
 * QUORUMKIT_PROJECT_DIR is already set by the caller) and requires
 * dashboard/server.js in-process. server.js itself owns --port / PORT
 * argv/env parsing and EADDRINUSE handling, so this wrapper stays thin.
 */
'use strict';

const path = require('path');

if (!process.env.QUORUMKIT_PROJECT_DIR) {
  process.env.QUORUMKIT_PROJECT_DIR = process.cwd();
}

require(path.join(__dirname, '..', 'dashboard', 'server.js'));
