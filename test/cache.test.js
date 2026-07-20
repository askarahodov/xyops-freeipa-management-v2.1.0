'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDirectoryCache,
  splitList,
  syncDirectoryCache
} = require('../index');

test('splitList accepts bucket multi-select arrays', () => {
  assert.deepEqual(splitList(['developers', ' devops ', '']), ['developers', 'devops']);
});

test('buildDirectoryCache creates separate user menus and group labels', () => {
  const cache = buildDirectoryCache(
    [
      { uid: 'petrov', name: 'Пётр Петров', status: 'disabled' },
      { uid: 'ivanov', name: 'Иван Иванов', status: 'enabled' }
    ],
    [
      { uid: 'sidorov', name: 'Сидор Сидоров', status: 'preserved' }
    ],
    [
      { name: 'devops', description: 'DevOps engineers' },
      { name: 'admins', description: '' }
    ],
    {
      truncated: false,
      updatedAt: '2026-07-20T10:30:00.000Z'
    }
  );

  assert.deepEqual(cache.enabled_users, [
    { id: 'ivanov', title: 'Иван Иванов (ivanov)' }
  ]);
  assert.deepEqual(cache.disabled_users, [
    { id: 'petrov', title: 'Пётр Петров (petrov) — отключён' }
  ]);
  assert.deepEqual(cache.preserved_users, [
    { id: 'sidorov', title: 'Сидор Сидоров (sidorov) — сохранён' }
  ]);
  assert.deepEqual(cache.groups, [
    { id: 'admins', title: 'admins' },
    { id: 'devops', title: 'devops — DevOps engineers' }
  ]);
  assert.deepEqual(cache.metadata.counts, {
    users: 2,
    enabled_users: 1,
    disabled_users: 1,
    preserved_users: 1,
    groups: 2
  });
});

test('syncDirectoryCache queries users, preserved users and groups', async () => {
  const calls = [];
  const client = {
    async rpc(method, args, options) {
      calls.push({ method, args, options });

      if (method === 'group_find') {
        return {
          result: [
            {
              cn: ['developers'],
              description: ['Developers'],
              gidnumber: ['2001'],
              member_user: ['ivanov']
            }
          ],
          truncated: false
        };
      }

      if (options.preserved) {
        return {
          result: [
            {
              uid: ['olduser'],
              cn: ['Old User']
            }
          ],
          truncated: false
        };
      }

      return {
        result: [
          {
            uid: ['ivanov'],
            cn: ['Ivan Ivanov'],
            nsaccountlock: [false]
          },
          {
            uid: ['petrov'],
            cn: ['Petr Petrov'],
            nsaccountlock: [true]
          }
        ],
        truncated: false
      };
    }
  };
  const messages = [];

  const result = await syncDirectoryCache(
    { list_limit: 500 },
    client,
    (message) => messages.push(message)
  );

  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'user_find');
  assert.equal(calls[1].options.preserved, true);
  assert.equal(calls[2].method, 'group_find');

  const dataMessage = messages.find((message) => message.data);
  assert.ok(dataMessage);
  assert.equal(dataMessage.data.users.length, 2);
  assert.equal(dataMessage.data.enabled_users[0].id, 'ivanov');
  assert.equal(dataMessage.data.disabled_users[0].id, 'petrov');
  assert.equal(dataMessage.data.preserved_users[0].id, 'olduser');
  assert.equal(dataMessage.data.groups[0].id, 'developers');
  assert.match(result.description, /2 user\(s\), 1 group\(s\)/);
});
