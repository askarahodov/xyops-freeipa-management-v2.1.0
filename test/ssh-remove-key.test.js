#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { selectEntrypoint } = require('../runner');
const {
  buildRemoveKeyPayload,
  loadRemoveKeyScript
} = require('../ssh-remove-key');

test('runner routes SSH key removal to its entrypoint', () => {
  assert.equal(
    selectEntrypoint({ params: { action: 'ssh_remove_user_key' } }),
    'ssh-remove-key.js'
  );
});

test('SSH key removal payload contains no cleartext key', () => {
  const publicKey =
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test';

  const payload = buildRemoveKeyPayload({
    username: 'testuser',
    publicKey
  });

  assert.match(payload, /XYOPS_USERNAME_B64/);
  assert.match(payload, /remove-user-ssh-key/);
  assert.doesNotMatch(
    payload,
    new RegExp(publicKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(loadRemoveKeyScript(), /authorized_keys/);
});
