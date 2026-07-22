#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

const MENU_KEYS = Object.freeze([
  'users',
  'enabled_users',
  'disabled_users',
  'preserved_users',
  'groups'
]);

const NONE_ITEM = Object.freeze({ id: '', title: '(None)' });

function withNoneOption(items) {
  if (!Array.isArray(items)) return items;

  return [
    { ...NONE_ITEM },
    ...items.filter((item) => String(item?.id ?? '') !== '')
  ];
}

function addNoneOptions(message) {
  if (!message || typeof message !== 'object') return message;

  const data = message.data;
  const isDirectoryCache = data
    && typeof data === 'object'
    && data.metadata
    && typeof data.metadata === 'object'
    && MENU_KEYS.some((key) => Array.isArray(data[key]));

  if (!isDirectoryCache) return message;

  const updatedData = { ...data };
  for (const key of MENU_KEYS) {
    if (Array.isArray(updatedData[key])) {
      updatedData[key] = withNoneOption(updatedData[key]);
    }
  }

  return { ...message, data: updatedData };
}

function transformLine(line) {
  try {
    return JSON.stringify(addNoneOptions(JSON.parse(line)));
  } catch {
    return line;
  }
}

function getAction(input) {
  const params = input?.params || {};
  return String(params.action || params.operation || params.freeipa_tool || '').trim();
}

function selectEntrypoint(input) {
  const action = getAction(input);
  if (action === 'ssh_remove_user_key') return 'ssh-remove-key.js';
  return action.startsWith('ssh_') ? 'ssh.js' : 'index.js';
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('xyOps did not provide JSON on STDIN');

  let input;
  try {
    input = JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new Error(`xyOps provided invalid JSON on STDIN: ${error.message}`);
  }

  return { buffer, input };
}

async function main() {
  const { buffer, input } = await readInput();
  const entrypoint = selectEntrypoint(input);
  const child = spawn(process.execPath, [path.join(__dirname, entrypoint)], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit']
  });

  child.on('error', (error) => {
    process.stderr.write(`Failed to start plugin entrypoint ${entrypoint}: ${error.message}\n`);
    process.exitCode = 1;
  });

  child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      process.stderr.write(`Failed to send input to plugin entrypoint ${entrypoint}: ${error.message}\n`);
    }
  });
  child.stdin.end(buffer);

  const output = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  output.on('line', (line) => {
    process.stdout.write(`${transformLine(line)}\n`);
  });

  child.on('close', (code, signal) => {
    if (signal) {
      process.stderr.write(`Plugin entrypoint ${entrypoint} stopped by signal ${signal}\n`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({
      xy: 1,
      code: 1,
      description: error.message || String(error)
    })}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MENU_KEYS,
  NONE_ITEM,
  addNoneOptions,
  getAction,
  selectEntrypoint,
  transformLine,
  withNoneOption
};
