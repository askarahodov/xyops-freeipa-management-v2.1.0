'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProvisionPayload,
  loadProvisionScript,
  normalizePublicKey,
  normalizeUsername,
  parseHostPort
} = require('../ssh');
const { selectEntrypoint } = require('../runner');

test('runner sends SSH provisioning to ssh.js', () => {
  assert.equal(
    selectEntrypoint({ params: { action: 'ssh_provision_user' } }),
    'ssh.js'
  );
  assert.equal(
    selectEntrypoint({ params: { action: 'create_user' } }),
    'index.js'
  );
});

test('parseHostPort accepts IPv4, hostname and bracketed IPv6', () => {
  assert.deepEqual(
    parseHostPort('server.example.local:2222'),
    { host: 'server.example.local', port: 2222 }
  );
  assert.deepEqual(
    parseHostPort('10.0.0.10'),
    { host: '10.0.0.10', port: 22 }
  );
  assert.deepEqual(
    parseHostPort('[2001:db8::10]:2200'),
    { host: '2001:db8::10', port: 2200 }
  );
});

test('username and public key are validated', () => {
  assert.equal(normalizeUsername('test.user-1'), 'test.user-1');
  assert.equal(
    normalizePublicKey(
      'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test'
    ),
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test'
  );

  assert.throws(() => normalizeUsername('bad user'), /Invalid username/);
  assert.throws(() => normalizePublicKey('not-a-key'), /malformed/);
});

test('payload contains the script without cleartext secrets', () => {
  const password = 'StrongPassword123!';
  const publicKey =
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test';

  const payload = buildProvisionPayload({
    username: 'testuser',
    password,
    publicKey,
    grantSudo: true,
    passwordlessSudo: false
  });

  assert.match(payload, /useradd --create-home/);
  assert.match(payload, /authorized_keys/);
  assert.match(payload, /\/etc\/sudoers\.d\/90-xyops-/);
  assert.doesNotMatch(payload, new RegExp(password));
  assert.doesNotMatch(
    payload,
    new RegExp(publicKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(loadProvisionScript(), /chpasswd/);
});
