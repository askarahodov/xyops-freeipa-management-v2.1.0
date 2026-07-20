'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'xyops.json'), 'utf8')
);

test('toolset fields only use types supported by xyOps validator', () => {
  const allowed = new Set([
    'checkbox',
    'code',
    'json',
    'hidden',
    'select',
    'text',
    'textarea'
  ]);

  for (const item of payload.items) {
    if (item.type !== 'plugin') continue;

    for (const param of item.data.params || []) {
      if (param.type !== 'toolset') continue;

      for (const tool of param.data.tools || []) {
        for (const field of tool.fields || []) {
          assert.ok(
            allowed.has(field.type),
            `${tool.id}.${field.id} has unsupported nested type ${field.type}`
          );
          assert.ok(
            Object.prototype.hasOwnProperty.call(field, 'value'),
            `${tool.id}.${field.id} is missing value`
          );
        }
      }
    }
  }
});

test('dynamic bucket menus are top-level plugin parameters', () => {
  const main = payload.items.find(
    (item) => item.type === 'plugin' && item.data.id === 'pmlc2ha8fipa1'
  );

  assert.ok(main);
  const params = new Map(main.data.params.map((param) => [param.id, param]));

  assert.equal(params.get('uid').type, 'bucket');
  assert.equal(params.get('uid').bucket_path, 'users');
  assert.equal(params.get('groups').type, 'bucket');
  assert.equal(params.get('groups').bucket_path, 'groups');
  assert.equal(params.get('groups').multiple, true);
  assert.equal(params.get('user_group_filter').type, 'bucket');
});

test('create and restore operations are separate plugins', () => {
  const ids = payload.items
    .filter((item) => item.type === 'plugin')
    .map((item) => item.data.id);

  assert.ok(ids.includes('pmlc2ha8fipa_create'));
  assert.ok(ids.includes('pmlc2ha8fipa_restore'));
});
