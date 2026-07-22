#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const pluginConfig = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'xyops-ssh-plugin.json'),
  'utf8'
));
const workflowConfig = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'workflow-local-user-ssh.json'),
  'utf8'
));

test('standalone SSH workflow uses the existing local-user plugin', () => {
  const plugin = pluginConfig.items.find(
    (item) => item.type === 'plugin' && item.data.id === 'pmlc2ha8fssh_user'
  );
  const workflow = workflowConfig.items[0].data;
  const fieldIds = new Set(workflow.fields.map((field) => field.id));
  const splitNode = workflow.workflow.nodes.find(
    (node) => node.id === 'nlocalsplithosts1'
  );
  const sshNode = workflow.workflow.nodes.find(
    (node) => node.id === 'nlocalsshcreate1'
  );

  assert.ok(plugin);
  assert.equal(workflow.title, 'Создать локального SSH-пользователя на хостах');

  for (const field of [
    'username',
    'user_password',
    'public_key',
    'grant_sudo',
    'passwordless_sudo',
    'ssh_hosts'
  ]) {
    assert.equal(fieldIds.has(field), true);
  }

  assert.equal(fieldIds.has('ipa_url'), false);
  assert.equal(fieldIds.has('givenname'), false);
  assert.equal(fieldIds.has('sn'), false);

  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');
  assert.equal(sshNode.data.plugin, 'pmlc2ha8fssh_user');
  assert.equal(sshNode.data.params.action, 'ssh_provision_user');
  assert.equal(sshNode.data.params.host_port, '{{ data.item }}');
  assert.equal(sshNode.data.params.username, '{{ workflow.params.username }}');
  assert.equal(
    sshNode.data.params.user_password,
    '{{ workflow.params.user_password }}'
  );
  assert.equal(
    sshNode.data.params.public_key,
    '{{ workflow.params.public_key }}'
  );
});

test('standalone SSH workflow contains no FreeIPA jobs', () => {
  const workflow = workflowConfig.items[0].data;

  for (const node of workflow.workflow.nodes) {
    if (node.type !== 'job') continue;
    assert.equal(String(node.data.plugin).includes('ipa'), false);
  }
});
