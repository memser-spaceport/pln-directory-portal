/**
 * Bulk operations for the `event` index.
 *
 * Only an approved, non-deleted event is searchable. A changed row that is not visible (pending, rejected, draft or
 * deleted) produces a delete, so an event that stops being visible leaves the index on the next run.
 */

export const EVENT_INDEX = 'event';

export function isVisibleEvent(row) {
  return row.status === 'APPROVED' && row.isDeleted === false;
}

/**
 * @param rows changed "PLEvent" rows, each with `uid`, `status` and `isDeleted`
 * @param toDocument builds the search document of a visible row
 * @returns the body of one OpenSearch bulk request
 */
export function buildEventBulkBody(rows, toDocument) {
  return rows.flatMap((row) =>
    isVisibleEvent(row)
      ? [{ index: { _index: EVENT_INDEX, _id: row.uid } }, toDocument(row)]
      : [{ delete: { _index: EVENT_INDEX, _id: row.uid } }]
  );
}
