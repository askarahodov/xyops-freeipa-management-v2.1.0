'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeFingerprint,
  normalizePrivateKey,
  parseHostPort
} = require('../ssh');
const { selectEntrypoint } = require('../runner');

test('runner dispatches SSH actions to ssh.js', () => {
  assert.equal(selectEntrypoint({ params: { action: 'ssh_exec' } }), 'ssh.js');
  assert.equal(selectEntrypoint({ params: { action: 'create_user' } }), 'index.js');
});

test('parseHostPort accepts hostname, IPv4 and bracketed IPv6', () => {
  assert.deepEqual(parseHostPort('server.example.local:2222'), {
    host: 'server.example.local',
    port: 2222
  });
  assert.deepEqual(parseHostPort('10.0.0.10'), { host: '10.0.0.10', port: 22 });
  assert.deepEqual(parseHostPort('[2001:db8::10]:2200'), {
    host: '2001:db8::10',
    port: 2200
  });
});

test('private key and fingerprint values are normalized', () => {
  assert.equal(normalizePrivateKey('line1\\nline2'), 'line1\nline2');
  assert.equal(normalizeFingerprint('abc'), 'SHA256:abc');
  assert.equal(normalizeFingerprint('SHA256:abc'), 'SHA256:abc');
});
