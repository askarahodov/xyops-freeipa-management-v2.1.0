'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addNoneOptions,
  transformLine,
  withNoneOption
} = require('../runner');

test('withNoneOption adds one empty menu item at the beginning', () => {
  assert.deepEqual(
    withNoneOption([
      { id: '', title: 'Old empty item' },
      { id: 'ivanov', title: 'Иван Иванов (ivanov)' }
    ]),
    [
      { id: '', title: '(None)' },
      { id: 'ivanov', title: 'Иван Иванов (ivanov)' }
    ]
  );
});

test('addNoneOptions updates all directory cache menus without changing counters', () => {
  const message = addNoneOptions({
    xy: 1,
    data: {
      users: [{ id: 'ivanov', title: 'Иван Иванов (ivanov)' }],
      enabled_users: [{ id: 'ivanov', title: 'Иван Иванов (ivanov)' }],
      disabled_users: [],
      preserved_users: [],
      groups: [{ id: 'developers', title: 'developers' }],
      metadata: {
        counts: { users: 1, groups: 1 }
      }
    }
  });

  for (const key of ['users', 'enabled_users', 'disabled_users', 'preserved_users', 'groups']) {
    assert.deepEqual(message.data[key][0], { id: '', title: '(None)' });
  }

  assert.deepEqual(message.data.metadata.counts, { users: 1, groups: 1 });
});

test('transformLine leaves unrelated and non-JSON output unchanged', () => {
  assert.equal(transformLine('normal log line'), 'normal log line');
  assert.equal(
    transformLine(JSON.stringify({ xy: 1, data: { freeipa_user: { uid: 'ivanov' } } })),
    JSON.stringify({ xy: 1, data: { freeipa_user: { uid: 'ivanov' } } })
  );
});
