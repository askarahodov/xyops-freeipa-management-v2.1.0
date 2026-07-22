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
  path.join(__dirname, '..', 'workflow-disable-user-ssh-key.json'),
  'utf8'
));

test('SSH import contains the key-removal plugin', () => {
  const plugin = pluginConfig.items.find(
    (item) => item.data.id === 'pmlc2ha8fssh_key_remove'
  );

  assert.ok(plugin);
  assert.equal(plugin.data.title, 'SSH — Удалить публичный ключ пользователя');
});

test('workflow disables FreeIPA before removing SSH keys', () => {
  const workflow = workflowConfig.items[0].data;
  const disableNode = workflow.workflow.nodes.find(
    (node) => node.id === 'ndisableipa1'
  );
  const splitNode = workflow.workflow.nodes.find(
    (node) => node.id === 'nsplitdisable1'
  );
  const keyNode = workflow.workflow.nodes.find(
    (node) => node.id === 'nremovekey01'
  );
  const disableToSplit = workflow.workflow.connections.find(
    (connection) => connection.id === 'cdisablesplit'
  );

  assert.equal(disableNode.data.plugin, 'pmlc2ha8fipa1');
  assert.equal(disableNode.data.params.action, 'disable_user');
  assert.equal(disableNode.data.params.uid, '{{ workflow.params.uid }}');
  assert.equal(disableToSplit.condition, 'success');

  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');
  assert.equal(keyNode.data.plugin, 'pmlc2ha8fssh_key_remove');
  assert.equal(keyNode.data.params.action, 'ssh_remove_user_key');
  assert.equal(keyNode.data.params.username, '{{ workflow.params.uid }}');
  assert.equal(
    keyNode.data.params.public_key,
    '{{ workflow.params.ssh_public_key }}'
  );
});
