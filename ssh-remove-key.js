#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  asBoolean,
  asInteger,
  executePrivilegedScript,
  fingerprintSha256,
  normalizeFingerprint,
  normalizePublicKey,
  normalizeUsername,
  parseHostPort,
  resolveAuth,
  resolveSudoPassword
} = require('./ssh');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) throw new Error('xyOps did not provide JSON on STDIN');

  return JSON.parse(text);
}

function emit(message) {
  process.stdout.write(`${JSON.stringify({ xy: 1, ...message })}\n`);
}

function required(value, name) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`Required value is missing: ${name}`);
  return normalized;
}

function toBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function loadRemoveKeyScript() {
  return fs.readFileSync(
    path.join(__dirname, 'scripts', 'remove-user-ssh-key.sh'),
    'utf8'
  );
}

function buildRemoveKeyPayload({ username, publicKey }) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPublicKey = normalizePublicKey(publicKey);

  return [
    `export XYOPS_USERNAME_B64='${toBase64(normalizedUsername)}'`,
    `export XYOPS_PUBLIC_KEY_B64='${toBase64(normalizedPublicKey)}'`,
    loadRemoveKeyScript()
  ].join('\n');
}

async function main() {
  const input = await readStdin();
  const params = input.params || {};

  const action = required(params.action || 'ssh_remove_user_key', 'action');
  if (action !== 'ssh_remove_user_key') {
    throw new Error(`Unsupported SSH key action: ${action}`);
  }

  const { host, port } = parseHostPort(params.host_port, 22);
  const timeoutSeconds = asInteger(
    params.connect_timeout_seconds,
    15,
    1,
    300
  );
  const strictHostKey = asBoolean(params.strict_host_key, false);
  const expectedFingerprint = normalizeFingerprint(
    params.host_fingerprint ||
      process.env.SSH_HOST_FINGERPRINT ||
      input.secrets?.SSH_HOST_FINGERPRINT
  );
  const auth = resolveAuth(input);

  if (strictHostKey && !expectedFingerprint) {
    throw new Error(
      'Strict SSH host-key verification requires host_fingerprint'
    );
  }

  const connectionOptions = {
    host,
    port,
    username: auth.username,
    password: auth.password,
    privateKey: auth.privateKey,
    passphrase: auth.passphrase,
    readyTimeout: timeoutSeconds * 1000,
    keepaliveInterval: 5000,
    keepaliveCountMax: 2
  };

  if (expectedFingerprint) {
    connectionOptions.hostVerifier = (key) =>
      fingerprintSha256(key) === expectedFingerprint;
  }

  const username = normalizeUsername(params.username);
  const payload = buildRemoveKeyPayload({
    username,
    publicKey: params.public_key
  });
  const sudoPassword = resolveSudoPassword(input, auth);

  emit({
    status: `Removing SSH key for ${username} on ${host}:${port}`,
    progress: 0.25
  });

  const { Client } = require('ssh2');
  const result = await executePrivilegedScript(
    connectionOptions,
    payload,
    auth,
    sudoPassword,
    () => new Client()
  );

  emit({
    table: {
      title: 'SSH public key removal result',
      header: [
        'Host',
        'Port',
        'User',
        'Exit code',
        'STDOUT',
        'STDERR'
      ],
      rows: [[
        host,
        port,
        username,
        result.code,
        result.stdout.trim(),
        result.stderr.trim()
      ]],
      caption: `SSH service account: ${auth.username}`
    }
  });

  emit({
    data: {
      ssh_action: 'ssh_remove_user_key',
      ssh_host: host,
      ssh_port: port,
      ssh_user: username,
      ssh_exit_code: result.code,
      ssh_signal: result.signal,
      ssh_stdout: result.stdout,
      ssh_stderr: result.stderr
    }
  });

  emit({ progress: 1 });

  if (result.code !== 0) {
    emit({
      code: result.code || 1,
      description:
        `Failed to remove SSH key for ${username} on ${host}:${port}`,
      details: result.stderr
        ? `STDERR:\n\n\`\`\`text\n${result.stderr.trim()}\n\`\`\``
        : undefined
    });
    process.exitCode = 1;
    return;
  }

  emit({
    code: 0,
    description: `SSH key for ${username} processed on ${host}:${port}`
  });
}

if (require.main === module) {
  main().catch((error) => {
    emit({
      code: 1,
      description: error.message || String(error)
    });
    process.exitCode = 1;
  });
}

module.exports = {
  buildRemoveKeyPayload,
  loadRemoveKeyScript
};
