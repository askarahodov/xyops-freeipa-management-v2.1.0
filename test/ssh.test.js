'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProvisionUserScript,
  normalizeFingerprint,
  normalizePrivateKey,
  normalizePublicKey,
  normalizeUsername,
  parseHostPort
} = require('../ssh');
const { selectEntrypoint } = require('../runner');

test('runner dispatches SSH actions to ssh.js', () => {
  assert.equal(selectEntrypoint({ params: { action: 'ssh_exec' } }), 'ssh.js');
  assert.equal(selectEntrypoint({ params: { action: 'ssh_provision_user' } }), 'ssh.js');
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

test('provisioning input validates username and public key', () => {
  assert.equal(normalizeUsername('test.user-1'), 'test.user-1');
  assert.equal(
    normalizePublicKey('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test'),
    'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test'
  );
  assert.throws(() => normalizeUsername('bad user'), /Invalid username/);
  assert.throws(() => normalizePublicKey('not-a-key'), /malformed/);
});

test('provisioning script creates home, password, authorized_keys and sudo rule without cleartext secrets', () => {
  const password = 'StrongPassword123!';
  const publicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEexamplekey user@test';
  const script = buildProvisionUserScript({
    username: 'testuser',
    password,
    publicKey,
    grantSudo: true,
    passwordlessSudo: false
  });

  assert.match(script, /useradd -m -s \/bin\/bash/);
  assert.match(script, /chpasswd/);
  assert.match(script, /authorized_keys/);
  assert.match(script, /\/etc\/sudoers\.d/);
  assert.match(script, /ALL=\(ALL:ALL\) ALL/);
  assert.doesNotMatch(script, new RegExp(password));
  assert.doesNotMatch(script, new RegExp(publicKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
