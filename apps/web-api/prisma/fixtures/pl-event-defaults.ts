import { PLEvent, PLEventStatus } from '@prisma/client';

/** The approval and typed-field columns of a seeded event: approved, with no submitter and no typed details. */
export const SEED_PL_EVENT_COLUMNS: Pick<
  PLEvent,
  | 'status'
  | 'submitterUid'
  | 'sourceTeamUid'
  | 'reviewedAt'
  | 'reviewNote'
  | 'timezone'
  | 'format'
  | 'accessOption'
  | 'tags'
  | 'hostName'
  | 'venueAddress'
  | 'latitude'
  | 'longitude'
  | 'isAllDay'
  | 'registrationUrl'
  | 'meetingUrl'
  | 'privateDetails'
> = {
  status: PLEventStatus.APPROVED,
  submitterUid: null,
  sourceTeamUid: null,
  reviewedAt: null,
  reviewNote: null,
  timezone: null,
  format: null,
  accessOption: null,
  tags: [],
  hostName: null,
  venueAddress: null,
  latitude: null,
  longitude: null,
  isAllDay: false,
  registrationUrl: null,
  meetingUrl: null,
  privateDetails: null,
};
