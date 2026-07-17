#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const https = require('node:https');

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

function asInteger(value, fallback, min = 1, max = 10000) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer from ${min} to ${max}, received: ${value}`);
  }
  return parsed;
}

function normalizeIpaBaseUrl(value) {
  const input = required(value, 'ipa_url');
  const url = new URL(input.includes('://') ? input : `https://${input}`);
  if (url.protocol !== 'https:') throw new Error('FreeIPA URL must use HTTPS');
  const path = url.pathname.replace(/\/+$/, '');
  return path.endsWith('/ipa') ? `${url.origin}${path}` : `${url.origin}/ipa`;
}

function loadCa(caPath) {
  if (!caPath) return undefined;
  if (!fs.existsSync(caPath)) throw new Error(`FreeIPA CA certificate not found: ${caPath}`);
  return fs.readFileSync(caPath);
}

function httpsRequest(urlString, {
  method = 'POST', headers = {}, body = '', ca, insecureTls = false, timeoutMs = 30000
} = {}) {
  const url = new URL(urlString);

  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      },
      ca,
      rejectUnauthorized: !insecureTls,
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });

    req.on('timeout', () => req.destroy(new Error(`FreeIPA request timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end(body);
  });
}

function extractCookies(headers) {
  const values = headers['set-cookie'] || [];
  const list = Array.isArray(values) ? values : [values];
  return list.map((item) => String(item).split(';', 1)[0]).filter(Boolean).join('; ');
}

class FreeIpaClient {
  constructor({ ipaBaseUrl, username, password, ca, insecureTls = false, timeoutMs = 30000 }) {
    this.ipaBaseUrl = ipaBaseUrl;
    this.username = username;
    this.password = password;
    this.ca = ca;
    this.insecureTls = insecureTls;
    this.timeoutMs = timeoutMs;
    this.cookie = '';
    this.requestId = 0;
  }

  async login() {
    const body = new URLSearchParams({ user: this.username, password: this.password }).toString();
    const response = await httpsRequest(`${this.ipaBaseUrl}/session/login_password`, {
      headers: {
        Referer: this.ipaBaseUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/plain'
      },
      body,
      ca: this.ca,
      insecureTls: this.insecureTls,
      timeoutMs: this.timeoutMs
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const reason = response.headers['x-ipa-rejection-reason'];
      throw new Error(`FreeIPA authentication failed: HTTP ${response.statusCode}${reason ? `: ${reason}` : ''}`);
    }

    this.cookie = extractCookies(response.headers);
    if (!this.cookie) {
      const reason = response.headers['x-ipa-rejection-reason'];
      throw new Error(`FreeIPA authentication did not return a session cookie${reason ? `: ${reason}` : ''}`);
    }
  }

  async rpc(method, args = [], options = {}) {
    if (!this.cookie) await this.login();
    this.requestId += 1;

    const body = JSON.stringify({
      method,
      params: [args, options],
      id: this.requestId
    });

    const response = await httpsRequest(`${this.ipaBaseUrl}/session/json`, {
      headers: {
        Referer: this.ipaBaseUrl,
        Cookie: this.cookie,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body,
      ca: this.ca,
      insecureTls: this.insecureTls,
      timeoutMs: this.timeoutMs
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`FreeIPA JSON-RPC HTTP error ${response.statusCode}: ${response.body.slice(0, 500)}`);
    }

    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new Error(`FreeIPA returned invalid JSON: ${response.body.slice(0, 500)}`);
    }

    if (payload.error) {
      const message = payload.error.message || payload.error.name || JSON.stringify(payload.error);
      const error = new Error(`${method}: ${message}`);
      error.freeipaCode = payload.error.code;
      error.freeipaName = payload.error.name;
      throw error;
    }

    return payload.result;
  }
}

function first(value, fallback = '') {
  if (Array.isArray(value)) return value.length ? value[0] : fallback;
  if (value === undefined || value === null) return fallback;
  return value;
}

function list(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function entries(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? '')
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(items) {
  return [...new Set(items)];
}

function normalizeUser(entry, preserved = false) {
  const disabled = asBoolean(first(entry.nsaccountlock, false));
  return {
    uid: String(first(entry.uid)),
    name: String(first(entry.cn, `${first(entry.givenname)} ${first(entry.sn)}`)).trim(),
    first_name: String(first(entry.givenname)),
    last_name: String(first(entry.sn)),
    email: String(first(entry.mail)),
    status: preserved ? 'preserved' : (disabled ? 'disabled' : 'enabled'),
    groups: list(entry.memberof_group),
    uid_number: String(first(entry.uidnumber)),
    gid_number: String(first(entry.gidnumber)),
    home_directory: String(first(entry.homedirectory)),
    login_shell: String(first(entry.loginshell))
  };
}

function normalizeGroup(entry) {
  return {
    name: String(first(entry.cn)),
    description: String(first(entry.description)),
    gid_number: String(first(entry.gidnumber)),
    users: list(entry.member_user),
    groups: list(entry.member_group)
  };
}

function userTable(users) {
  return {
    title: 'FreeIPA users',
    header: ['Login', 'Full name', 'Email', 'Status', 'Groups'],
    rows: users.map((user) => [
      user.uid,
      user.name,
      user.email,
      user.status,
      user.groups.join(', ')
    ]),
    caption: `${users.length} user(s)`
  };
}

function groupTable(groups) {
  return {
    title: 'FreeIPA groups',
    header: ['Group', 'Description', 'GID', 'Users', 'Nested groups'],
    rows: groups.map((group) => [
      group.name,
      group.description,
      group.gid_number,
      group.users.length,
      group.groups.length
    ]),
    caption: `${groups.length} group(s)`
  };
}

async function listUsers(params, client, send) {
  const criteria = optional(params.search_criteria) || '';
  const limit = asInteger(params.list_limit, 200, 1, 10000);
  const options = { all: true, sizelimit: limit };
  const groupFilter = optional(params.user_group_filter);
  if (groupFilter) options.in_group = groupFilter;

  const activeResult = await client.rpc('user_find', [criteria], options);
  let users = entries(activeResult.result).map((entry) => normalizeUser(entry, false));
  let truncated = asBoolean(activeResult.truncated);

  if (asBoolean(params.include_preserved)) {
    const preservedOptions = { all: true, sizelimit: limit, preserved: true };
    const preservedResult = await client.rpc('user_find', [criteria], preservedOptions);
    users = users.concat(entries(preservedResult.result).map((entry) => normalizeUser(entry, true)));
    truncated = truncated || asBoolean(preservedResult.truncated);
  }

  users.sort((a, b) => a.uid.localeCompare(b.uid));
  send({ table: userTable(users) });
  send({ data: { freeipa_users: users, freeipa_users_truncated: truncated } });

  return {
    description: `Found ${users.length} FreeIPA user(s)${truncated ? ' (result truncated)' : ''}`,
    details: truncated ? 'FreeIPA reported a truncated result. Increase **List limit** or narrow the search.' : undefined
  };
}

async function showUser(params, client, send) {
  const uid = required(params.uid, 'uid');
  const result = await client.rpc('user_show', [uid], { all: true });
  const user = normalizeUser(result.result, false);
  send({ table: userTable([user]) });
  send({ data: { freeipa_user: user } });
  return { description: `FreeIPA user ${uid} loaded` };
}

async function createUser(params, client, send) {
  const uid = required(params.uid, 'uid');
  const givenname = required(params.givenname, 'givenname');
  const sn = required(params.sn, 'sn');
  const cn = optional(params.cn) || `${givenname} ${sn}`;

  const options = { givenname, sn, cn, all: true };
  const mappings = {
    mail: params.mail,
    telephonenumber: params.telephonenumber,
    mobile: params.mobile,
    title: params.job_title,
    departmentnumber: params.department_number,
    employeenumber: params.employee_number,
    loginshell: params.login_shell,
    homedirectory: params.home_directory,
    userpassword: params.initial_password
  };

  for (const [key, value] of Object.entries(mappings)) {
    const normalized = optional(value);
    if (normalized !== undefined) options[key] = normalized;
  }

  const result = await client.rpc('user_add', [uid], options);
  const groups = unique(splitList(params.groups));
  const addedGroups = [];

  for (const group of groups) {
    try {
      await client.rpc('group_add_member', [group], { user: [uid], all: true });
      addedGroups.push(group);
    } catch (error) {
      error.message = `User ${uid} was created, but adding it to group ${group} failed: ${error.message}`;
      throw error;
    }
  }

  const user = normalizeUser(result.result, false);
  user.groups = unique([...user.groups, ...addedGroups]);
  send({ table: userTable([user]) });
  send({ data: { freeipa_user: user, freeipa_added_groups: addedGroups } });
  return {
    description: addedGroups.length
      ? `Created FreeIPA user ${uid} and added to ${addedGroups.length} group(s)`
      : `Created FreeIPA user ${uid}`
  };
}

async function deleteUser(params, client, send) {
  const uid = required(params.uid, 'uid');
  if (!asBoolean(params.confirm_destructive)) {
    throw new Error('Deletion was not confirmed. Enable the confirmation checkbox.');
  }
  const preserve = asBoolean(params.preserve_user, true);
  await client.rpc('user_del', [uid], { preserve });
  send({ data: { freeipa_deleted_user: uid, freeipa_user_preserved: preserve } });
  return {
    description: preserve
      ? `Deleted and preserved FreeIPA user ${uid}`
      : `Permanently deleted FreeIPA user ${uid}`,
    details: preserve
      ? 'The user entry was preserved and can be restored using **Restore preserved user**.'
      : 'The user entry was permanently deleted.'
  };
}

async function restoreUser(params, client, send) {
  const uid = required(params.uid, 'uid');
  await client.rpc('user_undel', [uid], {});
  send({ data: { freeipa_restored_user: uid } });
  return { description: `Restored preserved FreeIPA user ${uid}` };
}

async function simpleUserCommand(params, client, send, method, verb, dataKey) {
  const uid = required(params.uid, 'uid');
  await client.rpc(method, [uid], {});
  send({ data: { [dataKey]: uid } });
  return { description: `${verb} FreeIPA user ${uid}` };
}

async function listGroups(params, client, send) {
  const criteria = optional(params.search_criteria) || '';
  const limit = asInteger(params.list_limit, 200, 1, 10000);
  const result = await client.rpc('group_find', [criteria], { all: true, sizelimit: limit });
  const groups = entries(result.result).map(normalizeGroup).sort((a, b) => a.name.localeCompare(b.name));
  const truncated = asBoolean(result.truncated);

  send({ table: groupTable(groups) });
  send({ data: { freeipa_groups: groups, freeipa_groups_truncated: truncated } });
  return {
    description: `Found ${groups.length} FreeIPA group(s)${truncated ? ' (result truncated)' : ''}`,
    details: truncated ? 'FreeIPA reported a truncated result. Increase **List limit** or narrow the search.' : undefined
  };
}

async function changeGroupMembership(params, client, send, method, actionText, dataKey) {
  const uid = required(params.uid, 'uid');
  const groups = unique(splitList(params.groups));
  if (!groups.length) throw new Error('At least one group is required');

  const changed = [];
  for (const group of groups) {
    await client.rpc(method, [group], { user: [uid], all: true });
    changed.push(group);
  }

  send({ data: { freeipa_user: uid, [dataKey]: changed } });
  return { description: `${actionText} user ${uid}: ${changed.join(', ')}` };
}

const OPERATIONS = {
  list_users: listUsers,
  show_user: showUser,
  create_user: createUser,
  delete_user: deleteUser,
  restore_user: restoreUser,
  disable_user: (params, client, send) => simpleUserCommand(
    params, client, send, 'user_disable', 'Disabled', 'freeipa_disabled_user'
  ),
  enable_user: (params, client, send) => simpleUserCommand(
    params, client, send, 'user_enable', 'Enabled', 'freeipa_enabled_user'
  ),
  unlock_user: (params, client, send) => simpleUserCommand(
    params, client, send, 'user_unlock', 'Unlocked', 'freeipa_unlocked_user'
  ),
  list_groups: listGroups,
  add_user_to_groups: (params, client, send) => changeGroupMembership(
    params, client, send, 'group_add_member', 'Added to groups for', 'freeipa_added_groups'
  ),
  remove_user_from_groups: (params, client, send) => changeGroupMembership(
    params, client, send, 'group_remove_member', 'Removed from groups for', 'freeipa_removed_groups'
  )
};

async function executeOperation(params, client, send = emit) {
  const action = required(params.action || params.operation || params.freeipa_tool, 'action');
  const handler = OPERATIONS[action];
  if (!handler) throw new Error(`Unsupported FreeIPA action: ${action}`);
  return handler(params, client, send);
}

async function main() {
  const input = await readStdin();
  const params = input.params || {};
  const secrets = input.secrets || {};

  const ipaBaseUrl = normalizeIpaBaseUrl(params.ipa_url || process.env.ipa_url || process.env.IPA_URL);
  const username = required(process.env.IPA_USERNAME || secrets.IPA_USERNAME, 'IPA_USERNAME secret');
  const password = required(process.env.IPA_PASSWORD || secrets.IPA_PASSWORD, 'IPA_PASSWORD secret');
  const caPath = optional(
    params.ca_cert_path || process.env.ca_cert_path || process.env.IPA_CA_CERT_PATH || secrets.IPA_CA_CERT_PATH
  );
  const insecureTls = asBoolean(params.insecure_tls ?? process.env.insecure_tls);
  const timeoutMs = asInteger(params.timeout_seconds ?? process.env.timeout_seconds, 30, 1, 300) * 1000;
  const ca = loadCa(caPath);

  const client = new FreeIpaClient({
    ipaBaseUrl,
    username,
    password,
    ca,
    insecureTls,
    timeoutMs
  });

  emit({ status: 'Authenticating with FreeIPA' });
  await client.login();
  emit({ status: 'Running FreeIPA operation', progress: 0.25 });

  const result = await executeOperation(params, client, emit);
  emit({ progress: 1 });
  emit({ code: 0, ...result });
}

if (require.main === module) {
  main().catch((error) => {
    emit({
      code: 1,
      description: error.message || String(error),
      details: error.freeipaCode !== undefined
        ? `FreeIPA error code: \`${error.freeipaCode}\`${error.freeipaName ? `  \nFreeIPA error type: \`${error.freeipaName}\`` : ''}`
        : undefined
    });
    process.exitCode = 1;
  });
}

module.exports = {
  FreeIpaClient,
  OPERATIONS,
  asBoolean,
  asInteger,
  entries,
  executeOperation,
  groupTable,
  normalizeGroup,
  normalizeIpaBaseUrl,
  normalizeUser,
  splitList,
  userTable
};
