/**
 * `GET /v1/members/:uid` (LAB-3215, design D11): event rows the member hid from their profile (`showOnProfile`
 * false) are dropped for every viewer except the member themselves. The old IRL contributions block then respects
 * "hide" too, with the new profile section off.
 */
export function presentEventGuestsForViewer<T extends Record<string, unknown>>(member: T, isOwner: boolean): T {
  if (isOwner || !Array.isArray(member.eventGuests)) {
    return member;
  }
  return {
    ...member,
    eventGuests: (member.eventGuests as Array<{ showOnProfile?: boolean }>).filter(
      (row) => row?.showOnProfile !== false
    ),
  };
}
