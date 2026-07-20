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

test('SSH plugins are imported separately before the workflow', () => {
  const pluginIds = pluginConfig.items.map((item) => item.data.id);

  assert.equal(pluginConfig.items.length, 2);
  assert.ok(pluginConfig.items.every((item) => item.type === 'plugin'));
  assert.ok(pluginIds.includes('pmlc2ha8fssh1'));
  assert.ok(pluginIds.includes('pmlc2ha8fssh_user'));

  assert.equal(workflowConfig.items.length, 1);
  assert.equal(workflowConfig.items[0].type, 'event');
  assert.equal(workflowConfig.items[0].data.type, 'workflow');
});

test('workflow creates the FreeIPA user before provisioning SSH hosts', () => {
  const workflow = workflowConfig.items[0].data;
  const fields = new Map(workflow.fields.map((field) => [field.id, field]));
  const createNode = workflow.workflow.nodes.find((node) => node.id === 'ncreateipa1');
  const splitNode = workflow.workflow.nodes.find((node) => node.id === 'nsplithost1');
  const sshNode = workflow.workflow.nodes.find((node) => node.id === 'nsshexec01');
  const createToSplit = workflow.workflow.connections.find((conn) => conn.id === 'ccreatesplit');

  assert.equal(fields.get('initial_password').required, true);
  assert.equal(fields.get('ssh_public_key').required, true);
  assert.equal(fields.get('grant_sudo').value, true);

  assert.equal(createNode.data.plugin, 'pmlc2ha8fipa_create');
  assert.equal(createNode.data.params.uid, '{{ workflow.params.uid }}');
  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');
  assert.equal(createToSplit.condition, 'success');

  assert.equal(sshNode.data.plugin, 'pmlc2ha8fssh_user');
  assert.equal(sshNode.data.params.action, 'ssh_provision_user');
  assert.equal(sshNode.data.params.host_port, '{{ data.item }}');
  assert.equal(sshNode.data.params.username, '{{ workflow.params.uid }}');
  assert.equal(sshNode.data.params.user_password, '{{ workflow.params.initial_password }}');
  assert.equal(sshNode.data.params.public_key, '{{ workflow.params.ssh_public_key }}');
  assert.equal(sshNode.data.params.connect_timeout_seconds, '15');
});

test('provisioning plugin declares every workflow parameter', () => {
  const plugin = pluginConfig.items.find((item) => item.data.id === 'pmlc2ha8fssh_user').data;
  const declared = new Set(plugin.params.map((param) => param.id));
  const workflow = workflowConfig.items[0].data;
  const sshNode = workflow.workflow.nodes.find((node) => node.id === 'nsshexec01');

  for (const id of Object.keys(sshNode.data.params)) {
    assert.ok(declared.has(id), `Missing plugin parameter declaration: ${id}`);
  }
});

test('portable workflow has no external tag dependencies', () => {
  const workflow = workflowConfig.items[0].data;
  assert.deepEqual(workflow.tags, []);

  for (const node of workflow.workflow.nodes) {
    if (node.type === 'job') assert.deepEqual(node.data.tags, []);
  }
});
