import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildEventBulkBody, isVisibleEvent } from './events-bulk.mjs';

const toDocument = (row) => ({ uid: row.uid, name: row.name });

test('an approved event is indexed', () => {
  const body = buildEventBulkBody([{ uid: 'e1', name: 'Summit', status: 'APPROVED', isDeleted: false }], toDocument);
  assert.deepEqual(body, [{ index: { _index: 'event', _id: 'e1' } }, { uid: 'e1', name: 'Summit' }]);
});

test('a rejected event produces a delete and no index call', () => {
  const body = buildEventBulkBody([{ uid: 'e2', name: 'Rejected Meetup', status: 'REJECTED', isDeleted: false }], () =>
    assert.fail('a rejected event must not be turned into a document')
  );
  assert.deepEqual(body, [{ delete: { _index: 'event', _id: 'e2' } }]);
  assert.equal(
    body.some((op) => 'index' in op),
    false
  );
});

test('pending, draft and deleted events are removed', () => {
  for (const row of [
    { uid: 'p', status: 'PENDING', isDeleted: false },
    { uid: 'd', status: 'DRAFT', isDeleted: false },
    { uid: 'x', status: 'APPROVED', isDeleted: true },
  ]) {
    assert.equal(isVisibleEvent(row), false);
    assert.deepEqual(buildEventBulkBody([row], toDocument), [{ delete: { _index: 'event', _id: row.uid } }]);
  }
});

test('a mixed batch keeps the row order', () => {
  const body = buildEventBulkBody(
    [
      { uid: 'a', name: 'A', status: 'APPROVED', isDeleted: false },
      { uid: 'b', name: 'B', status: 'REJECTED', isDeleted: false },
      { uid: 'c', name: 'C', status: 'APPROVED', isDeleted: false },
    ],
    toDocument
  );
  assert.deepEqual(
    body.map((op) => Object.keys(op)[0]),
    ['index', 'uid', 'delete', 'index', 'uid']
  );
});
