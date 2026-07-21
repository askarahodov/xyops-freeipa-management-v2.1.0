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

test('local workflow provisions users without FreeIPA fields or nodes', () => {
  const event = workflowConfig.items[0].data;
  const fieldIds = new Set(event.fields.map((field) => field.id));
  const nodeTypes = event.workflow.nodes.map((node) => node.type);
  const job = event.workflow.nodes.find((node) => node.id === 'nlocaluser01');

  assert.equal(event.title, 'Создать локального пользователя на SSH-хостах');
  assert.equal(fieldIds.has('ipa_url'), false);
  assert.equal(fieldIds.has('initial_password'), false);
  assert.equal(fieldIds.has('freeipa_groups'), false);
  assert.deepEqual(nodeTypes, ['trigger', 'controller', 'job']);
  assert.equal(job.data.plugin, 'pmlc2ha8fssh_user');
  assert.equal(job.data.params.action, 'ssh_provision_user');
  assert.equal(job.data.params.username, '{{ workflow.params.username }}');
  assert.equal(job.data.params.user_password, '{{ workflow.params.user_password }}');
  assert.equal(job.data.params.public_key, '{{ workflow.params.public_key }}');
});

test('local workflow plugin declares all supplied job parameters', () => {
  const plugin = pluginConfig.items.find(
    (item) => item.data.id === 'pmlc2ha8fssh_user'
  ).data;
  const declared = new Set(plugin.params.map((param) => param.id));
  const job = workflowConfig.items[0].data.workflow.nodes.find(
    (node) => node.id === 'nlocaluser01'
  );

  for (const parameter of Object.keys(job.data.params)) {
    assert.ok(declared.has(parameter), `Missing plugin parameter: ${parameter}`);
  }
});

test('local workflow has no external tag dependencies', () => {
  const event = workflowConfig.items[0].data;
  assert.deepEqual(event.tags, []);

  for (const node of event.workflow.nodes) {
    if (node.type === 'job') assert.deepEqual(node.data.tags, []);
  }
});
