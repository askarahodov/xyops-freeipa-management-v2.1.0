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

test('standalone workflow provisions local users without FreeIPA', () => {
  const workflow = workflowConfig.items[0].data;
  const fields = new Map(workflow.fields.map((field) => [field.id, field]));
  const splitNode = workflow.workflow.nodes.find((node) => node.id === 'nsplitlocal1');
  const jobNode = workflow.workflow.nodes.find((node) => node.id === 'nprovisionlocal1');

  assert.equal(workflow.title, 'Создать локального пользователя на SSH-хостах');
  assert.equal(workflow.workflow.nodes.some((node) => node.id === 'ncreateipa1'), false);
  assert.equal(fields.get('username').required, true);
  assert.equal(fields.get('user_password').variant, 'password');
  assert.equal(fields.get('public_key').required, true);
  assert.equal(fields.get('grant_sudo').value, true);
  assert.equal(fields.get('passwordless_sudo').value, false);
  assert.equal(splitNode.data.split, 'workflow.params.ssh_hosts');

  assert.equal(jobNode.data.plugin, 'pmlc2ha8fssh_user');
  assert.equal(jobNode.data.params.action, 'ssh_provision_user');
  assert.equal(jobNode.data.params.host_port, '{{ data.item }}');
  assert.equal(jobNode.data.params.username, '{{ workflow.params.username }}');
  assert.equal(jobNode.data.params.user_password, '{{ workflow.params.user_password }}');
  assert.equal(jobNode.data.params.public_key, '{{ workflow.params.public_key }}');
  assert.deepEqual(jobNode.data.tags, []);
});

test('required provisioning plugin is present in the SSH plugin import', () => {
  const plugin = pluginConfig.items.find(
    (item) => item.type === 'plugin' && item.data.id === 'pmlc2ha8fssh_user'
  );

  assert.ok(plugin);
  assert.equal(plugin.data.title, 'SSH — Создать локального пользователя');
});
