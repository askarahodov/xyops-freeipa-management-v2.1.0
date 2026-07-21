#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

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

function optional(value) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function asInteger(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received: ${value}`);
  }

  return parsed;
}

function parseHostPort(value, defaultPort = 22) {
  const input = required(value, 'host_port');
  const bracketed = input.match(/^\[([^\]]+)](?::(\d+))?$/);

  if (bracketed) {
    return {
      host: bracketed[1],
      port: asInteger(bracketed[2], defaultPort, 1, 65535)
    };
  }

  const colonCount = (input.match(/:/g) || []).length;
  if (colonCount === 1) {
    const match = input.match(/^([^:]+):(\d+)$/);
    if (match) {
      return {
        host: required(match[1], 'SSH host'),
        port: asInteger(match[2], defaultPort, 1, 65535)
      };
    }
  }

  return { host: input, port: defaultPort };
}

function normalizePrivateKey(value) {
  const key = optional(value);
  if (!key) return undefined;

  return key.includes('\\n') && !key.includes('\n')
    ? key.replace(/\\n/g, '\n')
    : key;
}

function fingerprintSha256(key) {
  return `SHA256:${crypto
    .createHash('sha256')
    .update(key)
    .digest('base64')
    .replace(/=+$/, '')}`;
}

function normalizeFingerprint(value) {
  const fingerprint = optional(value);
  if (!fingerprint) return undefined;

  return fingerprint.startsWith('SHA256:')
    ? fingerprint
    : `SHA256:${fingerprint}`;
}

function normalizeUsername(value) {
  const username = required(value, 'username');

  if (!/^[a-z_][a-z0-9_.-]{0,31}$/.test(username)) {
    throw new Error(
      'Invalid username. Use 1–32 characters: letters, digits, underscore, dot or hyphen'
    );
  }

  return username;
}

function normalizePassword(value) {
  const password = String(value ?? '');
  if (!password) throw new Error('Required value is missing: user_password');

  if (/[\r\n\0]/.test(password)) {
    throw new Error('User password must not contain newline or NUL characters');
  }

  return password;
}

function normalizePublicKey(value) {
  const publicKey = required(value, 'public_key');

  if (/[\r\n]/.test(publicKey)) {
    throw new Error('SSH public key must be provided on one line');
  }

  const parts = publicKey.split(/\s+/);
  if (parts.length < 2) throw new Error('SSH public key is malformed');

  const [type, payload, ...comment] = parts;
  const supportedType =
    /^(?:ssh-(?:rsa|ed25519)|ecdsa-sha2-nistp(?:256|384|521)|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)$/;

  if (!supportedType.test(type) || !/^[A-Za-z0-9+/=]+$/.test(payload)) {
    throw new Error(`Unsupported or malformed SSH public key type: ${type}`);
  }

  return [type, payload, ...comment].join(' ');
}

function resolveAuth(input) {
  const params = input.params || {};
  const secrets = input.secrets || {};

  const username = required(
    params.ssh_username || process.env.SSH_USERNAME || secrets.SSH_USERNAME,
    'SSH_USERNAME secret'
  );
  const password = optional(process.env.SSH_PASSWORD || secrets.SSH_PASSWORD);
  const privateKey = normalizePrivateKey(
    process.env.SSH_PRIVATE_KEY || secrets.SSH_PRIVATE_KEY
  );
  const passphrase = optional(
    process.env.SSH_PASSPHRASE || secrets.SSH_PASSPHRASE
  );

  if (!password && !privateKey) {
    throw new Error(
      'SSH authentication is missing: provide SSH_PASSWORD or SSH_PRIVATE_KEY'
    );
  }

  return { username, password, privateKey, passphrase };
}

function resolveSudoPassword(input, auth) {
  const secrets = input.secrets || {};
  const value =
    process.env.SSH_SUDO_PASSWORD ||
    secrets.SSH_SUDO_PASSWORD ||
    auth.password;

  if (value === undefined || value === null || value === '') return undefined;

  const password = String(value);
  if (/[\r\n\0]/.test(password)) {
    throw new Error(
      'SSH_SUDO_PASSWORD must not contain newline or NUL characters'
    );
  }

  return password;
}

function executeSshCommand(options, command, createClient, stdinData = '') {
  return new Promise((resolve, reject) => {
    const client = createClient();
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try {
        client.end();
      } catch {}
      reject(error);
    };

    client.on('ready', () => {
      client.exec(command, (error, stream) => {
        if (error) return fail(error);

        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk) => {
          stdout += chunk.toString('utf8');
        });
        stream.stderr.on('data', (chunk) => {
          stderr += chunk.toString('utf8');
        });
        stream.on('close', (code, signal) => {
          if (settled) return;
          settled = true;
          client.end();

          resolve({
            code: Number.isInteger(code) ? code : 0,
            signal: signal || '',
            stdout,
            stderr
          });
        });

        stream.end(stdinData);
      });
    });

    client.on('error', fail);
    client.connect(options);
  });
}

function toBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function loadProvisionScript() {
  return fs.readFileSync(
    path.join(__dirname, 'scripts', 'create-local-user.sh'),
    'utf8'
  );
}

function buildProvisionPayload({
  username,
  password,
  publicKey,
  grantSudo = true,
  passwordlessSudo = false
}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);
  const normalizedPublicKey = normalizePublicKey(publicKey);

  return [
    `export XYOPS_USERNAME_B64='${toBase64(normalizedUsername)}'`,
    `export XYOPS_PASSWORD_B64='${toBase64(normalizedPassword)}'`,
    `export XYOPS_PUBLIC_KEY_B64='${toBase64(normalizedPublicKey)}'`,
    `export XYOPS_GRANT_SUDO='${asBoolean(grantSudo, true)}'`,
    `export XYOPS_PASSWORDLESS_SUDO='${asBoolean(passwordlessSudo, false)}'`,
    loadProvisionScript()
  ].join('\n');
}

async function executePrivilegedScript(
  connectionOptions,
  payload,
  auth,
  sudoPassword,
  createClient
) {
  if (auth.username === 'root') {
    return executeSshCommand(
      connectionOptions,
      'bash -s',
      createClient,
      payload
    );
  }

  const probe = await executeSshCommand(
    connectionOptions,
    'sudo -n true',
    createClient
  );

  if (probe.code === 0) {
    return executeSshCommand(
      connectionOptions,
      'sudo -n bash -s',
      createClient,
      payload
    );
  }

  if (!sudoPassword) {
    throw new Error(
      'SSH account cannot run sudo. Add SSH_SUDO_PASSWORD or configure NOPASSWD sudo.'
    );
  }

  return executeSshCommand(
    connectionOptions,
    "sudo -S -p '' bash -s",
    createClient,
    `${sudoPassword}\n${payload}`
  );
}

async function main() {
  const input = await readStdin();
  const params = input.params || {};

  const action = required(params.action || 'ssh_provision_user', 'action');
  if (action !== 'ssh_provision_user') {
    throw new Error(`Unsupported SSH action: ${action}`);
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
  const grantSudo = asBoolean(params.grant_sudo, true);
  const passwordlessSudo = asBoolean(params.passwordless_sudo, false);
  const payload = buildProvisionPayload({
    username,
    password: params.user_password,
    publicKey: params.public_key,
    grantSudo,
    passwordlessSudo
  });
  const sudoPassword = resolveSudoPassword(input, auth);

  emit({
    status: `Creating local user ${username} on ${host}:${port}`,
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

  const sudoMode = grantSudo
    ? passwordlessSudo
      ? 'passwordless'
      : 'password'
    : 'disabled';

  emit({
    table: {
      title: 'Local user creation result',
      header: [
        'Host',
        'Port',
        'User',
        'Sudo',
        'Exit code',
        'STDOUT',
        'STDERR'
      ],
      rows: [[
        host,
        port,
        username,
        sudoMode,
        result.code,
        result.stdout.trim(),
        result.stderr.trim()
      ]],
      caption: `SSH service account: ${auth.username}`
    }
  });

  emit({
    data: {
      ssh_action: 'ssh_provision_user',
      ssh_host: host,
      ssh_port: port,
      provisioned_user: username,
      provisioned_user_sudo: sudoMode,
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
        `Failed to create local user ${username} on ${host}:${port}`,
      details: result.stderr
        ? `STDERR:\n\n\`\`\`text\n${result.stderr.trim()}\n\`\`\``
        : undefined
    });
    process.exitCode = 1;
    return;
  }

  emit({
    code: 0,
    description: `Local user ${username} configured on ${host}:${port}`
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
  asBoolean,
  asInteger,
  buildProvisionPayload,
  executePrivilegedScript,
  executeSshCommand,
  fingerprintSha256,
  loadProvisionScript,
  normalizeFingerprint,
  normalizePassword,
  normalizePrivateKey,
  normalizePublicKey,
  normalizeUsername,
  parseHostPort,
  resolveAuth,
  resolveSudoPassword
};
