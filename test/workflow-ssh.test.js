'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const config = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'workflow-create-user-ssh.json'),
  'utf8'
));

test('portable file contains SSH plugin and workflow', () => {
  const sshPlugin = config.items.find((item) => item.type === 'plugin' && item.data.id === 'pmlc2ha8fssh1');
  const workflow = config.items.find((item) => item.type === 'event' && item.data.type === 'workflow');
  assert.ok(sshPlugin);
  assert.ok(workflow);
  assert.equal(sshPlugin.data.params.find((param) => param.id === 'action').value, 'ssh_exec');
});

test('workflow creates the user before splitting SSH hosts', () => {
  const workflow = config.items.find((item) => item.type === 'event').data;
  const createNode = workflow.workflow.nodes.find((node) => node.id === 'ncreateipa1');
  const splitNode = workflow.workflow.nodes.find((node) => node.id === 'nsplithost1');
  const sshNode = workflow.workflow.nodes.find((node) => node.id === 'nsshexec01');
  const createToSplit = workflow.workflow.connections.find((conn) => conn.id === 'ccreatesplit');

  assert.equal(createNode.data.plugin, 'pmlc2ha8fipa_create');
  assert.equal(createNode.data.params.uid, '{{ workflow.params.uid }}');
  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');
  assert.equal(createToSplit.condition, 'success');
  assert.equal(sshNode.data.params.host_port, '{{ data.item }}');
  assert.match(sshNode.data.params.command, /Hello World/);
});
