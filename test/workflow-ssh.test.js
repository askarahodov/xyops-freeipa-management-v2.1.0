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
  path.join(__dirname, '..', 'workflow-create-user-ssh.json'),
  'utf8'
));

test('SSH import contains the local-user creation plugin', () => {
  const plugin = pluginConfig.items.find(
    (item) => item.type === 'plugin' && item.data.id === 'pmlc2ha8fssh_user'
  );

  assert.ok(plugin);
  assert.equal(plugin.data.title, 'SSH — Создать локального пользователя');
});

test('workflow creates FreeIPA user before SSH users', () => {
  const workflow = workflowConfig.items[0].data;
  const fields = new Map(workflow.fields.map((field) => [field.id, field]));
  const freeipaNode = workflow.workflow.nodes.find(
    (node) => node.id === 'ncreateipa1'
  );
  const splitNode = workflow.workflow.nodes.find(
    (node) => node.id === 'nsplithost1'
  );
  const sshNode = workflow.workflow.nodes.find(
    (node) => node.id === 'nsshexec01'
  );
  const freeipaToSplit = workflow.workflow.connections.find(
    (connection) => connection.id === 'ccreatesplit'
  );

  assert.equal(fields.get('initial_password').required, true);
  assert.equal(fields.get('ssh_public_key').required, true);

  assert.equal(freeipaNode.data.plugin, 'pmlc2ha8fipa_create');
  assert.equal(
    freeipaNode.data.params.initial_password,
    '{{ workflow.params.initial_password }}'
  );

  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');
  assert.equal(freeipaToSplit.condition, 'success');

  assert.equal(sshNode.data.plugin, 'pmlc2ha8fssh_user');
  assert.equal(sshNode.data.params.action, 'ssh_provision_user');
  assert.equal(sshNode.data.params.host_port, '{{ data.item }}');
  assert.equal(sshNode.data.params.username, '{{ workflow.params.uid }}');
  assert.equal(
    sshNode.data.params.user_password,
    '{{ workflow.params.initial_password }}'
  );
  assert.equal(
    sshNode.data.params.public_key,
    '{{ workflow.params.ssh_public_key }}'
  );
});

test('workflow has no generic command step', () => {
  const workflow = workflowConfig.items[0].data;

  for (const node of workflow.workflow.nodes) {
    if (node.type !== 'job') continue;
    assert.equal(
      Object.prototype.hasOwnProperty.call(node.data.params, 'command'),
      false
    );
  }
});
