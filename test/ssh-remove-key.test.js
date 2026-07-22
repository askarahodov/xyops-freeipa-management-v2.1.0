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

test('SSH key removal payload contains only the encoded username', () => {
  const payload = buildRemoveKeyPayload({
    username: 'testuser'
  });

  assert.match(payload, /XYOPS_USERNAME_B64/);
  assert.doesNotMatch(payload, /XYOPS_PUBLIC_KEY_B64/);
  assert.match(payload, /remove-user-ssh-key/);
  assert.match(loadRemoveKeyScript(), /rm -f -- "\$AUTHORIZED_KEYS"/);
});
