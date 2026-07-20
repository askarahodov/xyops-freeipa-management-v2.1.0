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

test('SSH plugin is imported separately before the workflow', () => {
  assert.equal(pluginConfig.items.length, 1);
  assert.equal(pluginConfig.items[0].type, 'plugin');
  assert.equal(pluginConfig.items[0].data.id, 'pmlc2ha8fssh1');

  assert.equal(workflowConfig.items.length, 1);
  assert.equal(workflowConfig.items[0].type, 'event');
  assert.equal(workflowConfig.items[0].data.type, 'workflow');
});

test('workflow creates the user before splitting SSH hosts', () => {
  const workflow = workflowConfig.items[0].data;
  const createNode = workflow.workflow.nodes.find((node) => node.id === 'ncreateipa1');
  const splitNode = workflow.workflow.nodes.find((node) => node.id === 'nsplithost1');
  const sshNode = workflow.workflow.nodes.find((node) => node.id === 'nsshexec01');
  const createToSplit = workflow.workflow.connections.find((conn) => conn.id === 'ccreatesplit');

  assert.equal(createNode.data.plugin, 'pmlc2ha8fipa_create');
  assert.equal(createNode.data.params.uid, '{{ workflow.params.uid }}');
  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');
  assert.equal(createToSplit.condition, 'success');
  assert.equal(sshNode.data.plugin, 'pmlc2ha8fssh1');
  assert.equal(sshNode.data.params.host_port, '{{ data.item }}');
  assert.equal(sshNode.data.params.connect_timeout_seconds, '15');
  assert.match(sshNode.data.params.command, /Hello World/);
});

test('SSH timeout plugin parameter does not range-validate workflow macros during import', () => {
  const timeoutParam = pluginConfig.items[0].data.params.find(
    (param) => param.id === 'connect_timeout_seconds'
  );
  assert.ok(timeoutParam);
  assert.equal(timeoutParam.value, 15);
  assert.equal(Object.hasOwn(timeoutParam, 'range'), false);
});

test('portable workflow has no external tag dependencies', () => {
  const workflow = workflowConfig.items[0].data;
  assert.deepEqual(workflow.tags, []);

  for (const node of workflow.workflow.nodes) {
    if (node.type === 'job') assert.deepEqual(node.data.tags, []);
  }
});
