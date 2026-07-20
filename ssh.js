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

  if (colonCount > 1) return { host: input, port: defaultPort };
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

function normalizeUsername(value) {
  const username = required(value, 'username');
  if (!/^[a-z_][a-z0-9_.-]{0,31}$/.test(username)) {
    throw new Error(
      'Invalid username. Use 1–32 characters: letters, digits, underscore, dot or hyphen; start with a letter or underscore'
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
  const key = required(value, 'public_key');
  if (/[\r\n]/.test(key)) throw new Error('SSH public key must be provided on one line');

  const parts = key.split(/\s+/);
  if (parts.length < 2) throw new Error('SSH public key is malformed');

  const [type, payload, ...comment] = parts;
  const supportedType = /^(?:ssh-(?:rsa|ed25519)(?:-cert-v01@openssh\.com)?|ecdsa-sha2-nistp(?:256|384|521)(?:-cert-v01@openssh\.com)?|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)$/;
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
  const privateKey = normalizePrivateKey(process.env.SSH_PRIVATE_KEY || secrets.SSH_PRIVATE_KEY);
  const passphrase = optional(process.env.SSH_PASSPHRASE || secrets.SSH_PASSPHRASE);

  if (!password && !privateKey) {
    throw new Error('SSH authentication is missing: provide SSH_PASSWORD or SSH_PRIVATE_KEY in Secret Vault');
  }

  return { username, password, privateKey, passphrase };
}

function resolveSudoPassword(input, auth) {
  const secrets = input.secrets || {};
  const value = process.env.SSH_SUDO_PASSWORD || secrets.SSH_SUDO_PASSWORD || auth.password;
  if (value === undefined || value === null || value === '') return undefined;
  const password = String(value);
  if (/[\r\n\0]/.test(password)) {
    throw new Error('SSH_SUDO_PASSWORD must not contain newline or NUL characters');
  }
  return password;
}

function buildConnectionOptions({ host, port, timeoutSeconds, auth, expectedFingerprint }) {
  const options = {
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
    options.hostVerifier = (key) => fingerprintSha256(key) === expectedFingerprint;
  }

  return options;
}

function executeSshCommand(options, command, createClient, stdinData = '') {
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

function buildProvisionUserScript({
  username,
  password,
  publicKey,
  grantSudo = true,
  passwordlessSudo = false
}) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizePassword(password);
  const normalizedPublicKey = normalizePublicKey(publicKey);

  const usernameB64 = toBase64(normalizedUsername);
  const passwordB64 = toBase64(normalizedPassword);
  const publicKeyB64 = toBase64(normalizedPublicKey);

  return `#!/usr/bin/env bash
set -euo pipefail

decode_b64() {
  printf '%s' "$1" | base64 -d
}

USERNAME="$(decode_b64 '${usernameB64}')"
USER_PASSWORD="$(decode_b64 '${passwordB64}')"
PUBLIC_KEY="$(decode_b64 '${publicKeyB64}')"
GRANT_SUDO='${asBoolean(grantSudo, true) ? 'true' : 'false'}'
PASSWORDLESS_SUDO='${asBoolean(passwordlessSudo, false) ? 'true' : 'false'}'

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Provisioning script must run as root" >&2
  exit 10
fi

for cmd in getent useradd usermod chpasswd install id base64; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Required command is missing: $cmd" >&2
    exit 11
  }
done

if getent passwd "$USERNAME" >/dev/null 2>&1; then
  if ! grep -q "^\${USERNAME}:" /etc/passwd; then
    echo "User '$USERNAME' exists through NSS/FreeIPA but is not a local account. Refusing to create a duplicate local user." >&2
    exit 20
  fi
  USER_ACTION='updated'
else
  useradd -m -s /bin/bash "$USERNAME"
  USER_ACTION='created'
fi

USER_HOME="$(getent passwd "$USERNAME" | awk -F: '{print $6}')"
USER_GROUP="$(id -gn "$USERNAME")"

if [[ -z "$USER_HOME" ]]; then
  USER_HOME="/home/$USERNAME"
  usermod -d "$USER_HOME" "$USERNAME"
fi

install -d -m 0700 -o "$USERNAME" -g "$USER_GROUP" "$USER_HOME"
printf '%s:%s\\n' "$USERNAME" "$USER_PASSWORD" | chpasswd

install -d -m 0700 -o "$USERNAME" -g "$USER_GROUP" "$USER_HOME/.ssh"
TMP_KEY="$(mktemp)"
TMP_SUDOERS=''
cleanup() {
  rm -f "$TMP_KEY"
  [[ -z "$TMP_SUDOERS" ]] || rm -f "$TMP_SUDOERS"
}
trap cleanup EXIT

printf '%s\\n' "$PUBLIC_KEY" > "$TMP_KEY"
install -m 0600 -o "$USERNAME" -g "$USER_GROUP" "$TMP_KEY" "$USER_HOME/.ssh/authorized_keys"

if command -v restorecon >/dev/null 2>&1; then
  restorecon -RF "$USER_HOME/.ssh" >/dev/null 2>&1 || true
fi

SUDO_MODE='disabled'
ADMIN_GROUP=''

if [[ "$GRANT_SUDO" == 'true' ]]; then
  command -v sudo >/dev/null 2>&1 || {
    echo "sudo is not installed on the host" >&2
    exit 30
  }

  if getent group sudo >/dev/null 2>&1; then
    ADMIN_GROUP='sudo'
  elif getent group wheel >/dev/null 2>&1; then
    ADMIN_GROUP='wheel'
  else
    echo "Neither sudo nor wheel group exists" >&2
    exit 31
  fi

  usermod -aG "$ADMIN_GROUP" "$USERNAME"
  install -d -m 0750 /etc/sudoers.d

  if [[ "$PASSWORDLESS_SUDO" == 'true' ]]; then
    SUDO_RULE="$USERNAME ALL=(ALL:ALL) NOPASSWD: ALL"
    SUDO_MODE='passwordless'
  else
    SUDO_RULE="$USERNAME ALL=(ALL:ALL) ALL"
    SUDO_MODE='password'
  fi

  TMP_SUDOERS="$(mktemp)"
  printf '%s\\n' "$SUDO_RULE" > "$TMP_SUDOERS"
  chmod 0440 "$TMP_SUDOERS"

  if command -v visudo >/dev/null 2>&1; then
    visudo -cf "$TMP_SUDOERS" >/dev/null
  fi

  install -m 0440 "$TMP_SUDOERS" "/etc/sudoers.d/90-xyops-$USERNAME"
else
  rm -f "/etc/sudoers.d/90-xyops-$USERNAME"
fi

echo "status=success"
echo "user=$USERNAME"
echo "action=$USER_ACTION"
echo "home=$USER_HOME"
echo "shell=/bin/bash"
echo "authorized_keys=$USER_HOME/.ssh/authorized_keys"
echo "sudo=$SUDO_MODE"
[[ -z "$ADMIN_GROUP" ]] || echo "admin_group=$ADMIN_GROUP"
`;
}

async function executePrivilegedScript(connectionOptions, script, auth, sudoPassword, createClient) {
  if (auth.username === 'root') {
    return executeSshCommand(connectionOptions, 'bash -s', createClient, script);
  }

  const probe = await executeSshCommand(connectionOptions, 'sudo -n true', createClient);
  if (probe.code === 0) {
    return executeSshCommand(connectionOptions, 'sudo -n bash -s', createClient, script);
  }

  if (!sudoPassword) {
    throw new Error(
      'SSH account cannot run passwordless sudo. Add SSH_SUDO_PASSWORD to Secret Vault or configure NOPASSWD sudo.'
    );
  }

  return executeSshCommand(
    connectionOptions,
    "sudo -S -p '' bash -s",
    createClient,
    `${sudoPassword}\n${script}`
  );
}

function emitCommandResult({ host, port, auth, command, result }) {
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
      ssh_action: 'ssh_exec',
      ssh_host: host,
      ssh_port: port,
      ssh_command: command,
      ssh_exit_code: result.code,
      ssh_signal: result.signal,
      ssh_stdout: result.stdout,
      ssh_stderr: result.stderr
    }
  });
}

function emitProvisionResult({
  host,
  port,
  auth,
  username,
  grantSudo,
  passwordlessSudo,
  result
}) {
  const sudoMode = grantSudo ? (passwordlessSudo ? 'passwordless' : 'password') : 'disabled';

  emit({
    table: {
      title: 'SSH user provisioning result',
      header: ['Host', 'Port', 'User', 'Sudo', 'Exit code', 'STDOUT', 'STDERR'],
      rows: [[
        host,
        port,
        username,
        sudoMode,
        result.code,
        result.stdout.trim(),
        result.stderr.trim()
      ]],
      caption: `Provisioned over SSH as: ${auth.username}`
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
}

async function main() {
  const input = await readStdin();
  const params = input.params || {};
  const action = required(params.action || 'ssh_exec', 'action');
  const { host, port } = parseHostPort(params.host_port, 22);
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

  const createClient = () => {
    const { Client } = require('ssh2');
    return new Client();
  };
  const connectionOptions = buildConnectionOptions({
    host,
    port,
    timeoutSeconds,
    auth,
    expectedFingerprint
  });

  emit({ status: `Connecting to ${host}:${port}`, progress: 0.2 });

  let result;
  let description;

  if (action === 'ssh_exec') {
    const command = required(params.command || "printf 'Hello World\\n'", 'command');
    result = await executeSshCommand(connectionOptions, command, createClient);
    emitCommandResult({ host, port, auth, command, result });
    description = `SSH command completed on ${host}:${port}`;
  } else if (action === 'ssh_provision_user') {
    const username = normalizeUsername(params.username);
    const grantSudo = asBoolean(params.grant_sudo, true);
    const passwordlessSudo = asBoolean(params.passwordless_sudo, false);
    const script = buildProvisionUserScript({
      username,
      password: params.user_password,
      publicKey: params.public_key,
      grantSudo,
      passwordlessSudo
    });
    const sudoPassword = resolveSudoPassword(input, auth);

    emit({ status: `Provisioning local user ${username} on ${host}:${port}`, progress: 0.45 });
    result = await executePrivilegedScript(
      connectionOptions,
      script,
      auth,
      sudoPassword,
      createClient
    );
    emitProvisionResult({
      host,
      port,
      auth,
      username,
      grantSudo,
      passwordlessSudo,
      result
    });
    description = `User ${username} provisioned on ${host}:${port}`;
  } else {
    throw new Error(`Unsupported SSH action: ${action}`);
  }

  emit({ progress: 1 });

  if (result.code !== 0) {
    emit({
      code: result.code || 1,
      description: `${description} failed with exit code ${result.code}`,
      details: result.stderr ? `STDERR:\n\n\`\`\`text\n${result.stderr.trim()}\n\`\`\`` : undefined
    });
    process.exitCode = 1;
    return;
  }

  emit({ code: 0, description });
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
  buildConnectionOptions,
  buildProvisionUserScript,
  executePrivilegedScript,
  executeSshCommand,
  fingerprintSha256,
  normalizeFingerprint,
  normalizePassword,
  normalizePrivateKey,
  normalizePublicKey,
  normalizeUsername,
  parseHostPort,
  resolveAuth,
  resolveSudoPassword
};
