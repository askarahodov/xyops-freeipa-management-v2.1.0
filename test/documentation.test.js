#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

test('README documents every supported Secret Vault key', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const secretNames = [
    'IPA_USERNAME',
    'IPA_PASSWORD',
    'IPA_CA_CERT_PATH',
    'SSH_USERNAME',
    'SSH_PASSWORD',
    'SSH_PRIVATE_KEY',
    'SSH_PASSPHRASE',
    'SSH_SUDO_PASSWORD',
    'SSH_HOST_FINGERPRINT'
  ];

  for (const secret of secretNames) {
    assert.match(readme, new RegExp(`\\b${secret}\\b`), `${secret} is missing`);
  }
});

test('all imported Event Plugins have useful notes', () => {
  const configs = [
    readJson('xyops.json'),
    readJson('xyops-ssh-plugin.json')
  ];

  const plugins = configs.flatMap((config) =>
    config.items.filter((item) => item.type === 'plugin')
  );

  assert.equal(plugins.length, 5);

  for (const plugin of plugins) {
    const notes = String(plugin.data.notes || '').trim();
    assert.ok(notes.length >= 120, `${plugin.data.title} has insufficient notes`);
  }
});

test('all Workflow Events have clear descriptions and notes', () => {
  const workflowFiles = [
    'workflow-create-user-ssh.json',
    'workflow-disable-user-ssh-key.json',
    'workflow-local-user-ssh.json'
  ];

  for (const file of workflowFiles) {
    const config = readJson(file);
    const workflow = config.items[0].data;

    assert.ok(
      String(config.description || '').trim().length >= 100,
      `${file} has insufficient top-level description`
    );
    assert.ok(
      String(workflow.notes || '').trim().length >= 160,
      `${workflow.title} has insufficient notes`
    );
  }
});

test('workflow guides contain import and Secret Vault sections', () => {
  const guideFiles = [
    'WORKFLOW_CREATE_USER_SSH.md',
    'WORKFLOW_DISABLE_USER_SSH_KEY.md',
    'WORKFLOW_LOCAL_USER.md'
  ];

  for (const file of guideFiles) {
    const guide = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(guide, /## Импорт/);
    assert.match(guide, /## Secret Vault/);
  }
});
