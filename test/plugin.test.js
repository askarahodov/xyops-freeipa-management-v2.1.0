'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  executeOperation,
  normalizeIpaBaseUrl,
  normalizeUser,
  splitList
} = require('../index.js');

class FakeClient {
  constructor(responses = {}) {
    this.responses = responses;
    this.calls = [];
  }

  async rpc(method, args, options) {
    this.calls.push({ method, args, options });
    const response = this.responses[method];
    if (typeof response === 'function') return response(method, args, options);
    if (response instanceof Error) throw response;
    return response || { result: {}, count: 0, truncated: false };
  }
}

test('normalizes FreeIPA base URL', () => {
  assert.equal(normalizeIpaBaseUrl('ipa.example.test'), 'https://ipa.example.test/ipa');
  assert.equal(normalizeIpaBaseUrl('https://ipa.example.test/ipa/'), 'https://ipa.example.test/ipa');
});

test('splits and trims group lists', () => {
  assert.deepEqual(splitList('admins, developers\nvpn-users;admins'), [
    'admins', 'developers', 'vpn-users', 'admins'
  ]);
});

test('normalizes a disabled user', () => {
  assert.deepEqual(normalizeUser({
    uid: ['ivanov'],
    cn: ['Ivan Ivanov'],
    mail: ['ivanov@example.test'],
    nsaccountlock: [true],
    memberof_group: ['developers']
  }), {
    uid: 'ivanov',
    name: 'Ivan Ivanov',
    first_name: '',
    last_name: '',
    email: 'ivanov@example.test',
    status: 'disabled',
    groups: ['developers'],
    uid_number: '',
    gid_number: '',
    home_directory: '',
    login_shell: ''
  });
});

test('creates a user and adds it to groups', async () => {
  const client = new FakeClient({
    user_add: {
      result: {
        uid: ['ivanov'], cn: ['Ivan Ivanov'], givenname: ['Ivan'], sn: ['Ivanov']
      }
    },
    group_add_member: { result: {} }
  });
  const output = [];

  const result = await executeOperation({
    action: 'create_user',
    uid: 'ivanov',
    givenname: 'Ivan',
    sn: 'Ivanov',
    groups: 'developers,vpn-users'
  }, client, (message) => output.push(message));

  assert.equal(result.description, 'Created FreeIPA user ivanov and added to 2 group(s)');
  assert.deepEqual(client.calls.map((call) => call.method), [
    'user_add', 'group_add_member', 'group_add_member'
  ]);
  assert.equal(output.at(-1).data.freeipa_added_groups.length, 2);
});

test('requires confirmation before deletion', async () => {
  const client = new FakeClient();
  await assert.rejects(
    executeOperation({ action: 'delete_user', uid: 'ivanov' }, client, () => {}),
    /not confirmed/
  );
  assert.equal(client.calls.length, 0);
});

test('disables a user using user_disable', async () => {
  const client = new FakeClient({ user_disable: { result: true } });
  const result = await executeOperation({ action: 'disable_user', uid: 'ivanov' }, client, () => {});
  assert.equal(result.description, 'Disabled FreeIPA user ivanov');
  assert.equal(client.calls[0].method, 'user_disable');
});

test('lists users without converting entries to strings', async () => {
  const client = new FakeClient({
    user_find: {
      result: [
        { uid: ['alice'], cn: ['Alice Admin'], mail: ['alice@example.test'], nsaccountlock: [false] },
        { uid: ['bob'], cn: ['Bob Blocked'], mail: ['bob@example.test'], nsaccountlock: [true] }
      ],
      truncated: false
    }
  });
  const output = [];
  const result = await executeOperation({
    action: 'list_users',
    list_limit: 100
  }, client, (message) => output.push(message));

  assert.equal(result.description, 'Found 2 FreeIPA user(s)');
  assert.deepEqual(output[1].data.freeipa_users.map((user) => user.uid), ['alice', 'bob']);
  assert.equal(output[1].data.freeipa_users[1].status, 'disabled');
});

test('lists groups with member counts', async () => {
  const client = new FakeClient({
    group_find: {
      result: [
        { cn: ['developers'], description: ['Developers'], gidnumber: ['1001'], member_user: ['alice', 'bob'] }
      ],
      truncated: false
    }
  });
  const output = [];
  const result = await executeOperation({
    action: 'list_groups',
    list_limit: 100
  }, client, (message) => output.push(message));

  assert.equal(result.description, 'Found 1 FreeIPA group(s)');
  assert.equal(output[1].data.freeipa_groups[0].users.length, 2);
});
