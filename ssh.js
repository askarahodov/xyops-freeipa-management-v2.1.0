#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');

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
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      host: required(value.host || value.hostname, 'SSH host'),
      port: asInteger(value.port, defaultPort, 1, 65535)
    };
  }

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

  if (colonCount > 1) {
    return { host: input, port: defaultPort };
  }

  return { host: input, port: defaultPort };
}

function normalizePrivateKey(value) {
  const key = optional(value);
  if (!key) return undefined;
  return key.includes('\\n') && !key.includes('\n') ? key.replace(/\\n/g, '\n') : key;
}

function fingerprintSha256(key) {
  return `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

function normalizeFingerprint(value) {
  const fingerprint = optional(value);
  if (!fingerprint) return undefined;
  return fingerprint.startsWith('SHA256:') ? fingerprint : `SHA256:${fingerprint}`;
}

function resolveAuth(input) {
  const params = input.params || {};
  const secrets = input.secrets || {};
  const username = required(
    params.ssh_username || process.env.SSH_USERNAME || secrets.SSH_USERNAME,
    'SSH_USERNAME secret'
  );
  const password = optional(process.env.SSH_PASSWORD || secrets.SSH_PASSWORD);
  const privateKey = normalizePrivateKey(process.env.SSH_PRIVATE_KEY || secrets.SSH_PRIVATE_KEY);
  const passphrase = optional(process.env.SSH_PASSPHRASE || secrets.SSH_PASSPHRASE);

  if (!password && !privateKey) {
    throw new Error('SSH authentication is missing: provide SSH_PASSWORD or SSH_PRIVATE_KEY in Secret Vault');
  }

  return { username, password, privateKey, passphrase };
}

function executeSshCommand(options, command, createClient) {
  return new Promise((resolve, reject) => {
    const client = createClient();
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { client.end(); } catch {}
      reject(error);
    };

    client.on('ready', () => {
      client.exec(command, (error, stream) => {
        if (error) return fail(error);

        let stdout = '';
        let stderr = '';
        stream.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        stream.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
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
      });
    });

    client.on('error', fail);
    client.connect(options);
  });
}

async function main() {
  const input = await readStdin();
  const params = input.params || {};
  const { host, port } = parseHostPort(params.host_port, 22);
  const command = required(params.command || "printf 'Hello World\\n'", 'command');
  const timeoutSeconds = asInteger(params.connect_timeout_seconds, 15, 1, 300);
  const strictHostKey = asBoolean(params.strict_host_key, false);
  const expectedFingerprint = normalizeFingerprint(
    params.host_fingerprint
      || process.env.SSH_HOST_FINGERPRINT
      || input.secrets?.SSH_HOST_FINGERPRINT
  );
  const auth = resolveAuth(input);

  if (strictHostKey && !expectedFingerprint) {
    throw new Error('Strict SSH host-key verification requires host_fingerprint or SSH_HOST_FINGERPRINT');
  }

  emit({ status: `Connecting to ${host}:${port}`, progress: 0.2 });

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
    connectionOptions.hostVerifier = (key) => fingerprintSha256(key) === expectedFingerprint;
  }

  const result = await executeSshCommand(
    connectionOptions,
    command,
    () => {
      const { Client } = require('ssh2');
      return new Client();
    }
  );

  emit({
    table: {
      title: 'SSH command result',
      header: ['Host', 'Port', 'Command', 'Exit code', 'STDOUT', 'STDERR'],
      rows: [[
        host,
        port,
        command,
        result.code,
        result.stdout.trim(),
        result.stderr.trim()
      ]],
      caption: `SSH user: ${auth.username}`
    }
  });
  emit({
    data: {
      ssh_host: host,
      ssh_port: port,
      ssh_command: command,
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
      description: `SSH command failed on ${host}:${port} with exit code ${result.code}`,
      details: result.stderr ? `STDERR:\n\n\`\`\`text\n${result.stderr.trim()}\n\`\`\`` : undefined
    });
    process.exitCode = 1;
    return;
  }

  emit({
    code: 0,
    description: `SSH command completed on ${host}:${port}`
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
  executeSshCommand,
  fingerprintSha256,
  normalizeFingerprint,
  normalizePrivateKey,
  parseHostPort,
  resolveAuth
};
