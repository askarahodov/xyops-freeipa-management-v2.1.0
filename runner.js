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

function main() {
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit']
  });

  child.on('error', (error) => {
    process.stderr.write(`Failed to start FreeIPA plugin: ${error.message}\n`);
    process.exitCode = 1;
  });

  child.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') {
      process.stderr.write(`Failed to send input to FreeIPA plugin: ${error.message}\n`);
    }
  });

  process.stdin.pipe(child.stdin);

  const output = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  output.on('line', (line) => {
    process.stdout.write(`${transformLine(line)}\n`);
  });

  child.on('close', (code, signal) => {
    if (signal) {
      process.stderr.write(`FreeIPA plugin stopped by signal ${signal}\n`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

if (require.main === module) main();

module.exports = {
  MENU_KEYS,
  NONE_ITEM,
  addNoneOptions,
  transformLine,
  withNoneOption
};
