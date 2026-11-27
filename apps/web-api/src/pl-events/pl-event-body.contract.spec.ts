import {
  PLEventPartnerBodySchema,
  PLEventPatchBodySchema,
  PLEventSubmitBodySchema,
  eventDateIssues,
  eventSubmissionIssues,
} from 'libs/contracts/src/schema/pl-event-body';

const valid = {
  name: 'Lisbon Builders Night',
  startDate: '2026-07-24T18:00:00+01:00',
  endDate: '2026-07-24T21:00:00+01:00',
  timezone: 'Europe/Lisbon',
  format: 'IN_PERSON',
  tags: ['Networking Event'],
  hostName: 'Protocol Labs',
  address: { address: 'Avenida da Liberdade 10', city: 'Lisbon', country: 'Portugal' },
};

function issuePaths(schema: { safeParse: (input: unknown) => any }, body: unknown): string[] {
  const parsed = schema.safeParse(body);
  return parsed.success ? [] : parsed.error.issues.map((issue: { path: unknown[] }) => issue.path.join('.'));
}

describe('PLEventSubmitBodySchema', () => {
  it('accepts a valid in-person submission', () => {
    expect(PLEventSubmitBodySchema.safeParse(valid).success).toBe(true);
  });

  it('refuses an end before the start', () => {
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, endDate: '2026-07-24T17:00:00+01:00' })).toEqual([
      'endDate',
    ]);
  });

  it('accepts an in-person event with no city (the address is optional)', () => {
    const { address, ...noAddress } = valid;
    expect(PLEventSubmitBodySchema.safeParse(noAddress).success).toBe(true);
    expect(PLEventSubmitBodySchema.safeParse({ ...valid, address: { address: 'Somewhere' } }).success).toBe(true);
  });

  it('refuses a submission with no tag or no host name', () => {
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, tags: [] })).toEqual(['tags']);
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, hostName: '  ' })).toEqual(['hostName']);
  });

  it('accepts a draft with a name, dates and a time zone only', () => {
    const draft = { draft: true, name: 'Draft', startDate: valid.startDate, endDate: valid.endDate, timezone: 'UTC' };
    expect(PLEventSubmitBodySchema.safeParse(draft).success).toBe(true);
    expect(issuePaths(PLEventSubmitBodySchema, { ...draft, timezone: undefined })).toEqual(['timezone']);
  });

  it('drops a status sent by the submitter', () => {
    const parsed = PLEventSubmitBodySchema.parse({ ...valid, status: 'APPROVED' });
    expect(parsed).not.toHaveProperty('status');
  });

  it('refuses a link that is not http or https', () => {
    for (const key of ['locationUrl', 'websiteUrl', 'registrationUrl', 'meetingUrl']) {
      expect(issuePaths(PLEventSubmitBodySchema, { ...valid, [key]: 'javascript:alert(1)' })).toEqual([key]);
    }
    expect(PLEventSubmitBodySchema.safeParse({ ...valid, locationUrl: 'https://maps.app.goo.gl/abc' }).success).toBe(
      true
    );
  });

  it('refuses a co-host with no name and a wrong email', () => {
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, coHosts: [{ email: 'a@b.co' }] })).toEqual([
      'coHosts.0.name',
    ]);
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, hostEmail: 'not-an-email' })).toEqual(['hostEmail']);
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, coHosts: [{ name: 'Ann', email: 'nope' }] })).toEqual([
      'coHosts.0.email',
    ]);
  });

  it('takes date-only values with allDay and refuses them without', () => {
    const allDay = { ...valid, startDate: '2026-07-24', endDate: '2026-07-26' };
    expect(PLEventSubmitBodySchema.safeParse({ ...allDay, allDay: true }).success).toBe(true);
    expect(issuePaths(PLEventSubmitBodySchema, allDay)).toEqual(['startDate', 'endDate']);
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, allDay: true })).toEqual(['startDate', 'endDate']);
  });

  it('refuses an association with both or neither of member and team', () => {
    expect(
      PLEventSubmitBodySchema.safeParse({ ...valid, associations: [{ role: 'HOST', memberUid: 'm1' }] }).success
    ).toBe(true);
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, associations: [{ role: 'HOST' }] })).toEqual([
      'associations.0',
    ]);
    expect(
      issuePaths(PLEventSubmitBodySchema, { ...valid, associations: [{ role: 'ATTENDEE', memberUid: 'm1' }] })
    ).toEqual(['associations.0.role']);
  });

  it('refuses an unknown time zone and a position off the map', () => {
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, timezone: 'Mars/Olympus' })).toEqual(['timezone']);
    expect(issuePaths(PLEventSubmitBodySchema, { ...valid, address: { latitude: 120, longitude: 0 } })).toEqual([
      'address.latitude',
    ]);
  });
});

describe('PLEventPartnerBodySchema', () => {
  it('needs only a name, a start date and a format', () => {
    const minimal = { name: 'ETHDenver', startDate: '2026-07-24', allDay: true, format: 'IN_PERSON' };
    expect(PLEventPartnerBodySchema.safeParse(minimal).success).toBe(true);
    expect(issuePaths(PLEventPartnerBodySchema, { ...minimal, format: undefined })).toEqual(['format']);
    expect(issuePaths(PLEventPartnerBodySchema, { ...minimal, name: '' })).toEqual(['name']);
  });

  it('refuses an end before the start', () => {
    expect(
      issuePaths(PLEventPartnerBodySchema, {
        name: 'X',
        format: 'VIRTUAL',
        allDay: true,
        startDate: '2026-07-24',
        endDate: '2026-07-23',
      })
    ).toEqual(['endDate']);
  });
});

describe('PLEventPatchBodySchema', () => {
  it('takes any subset of fields, null to clear, and a status for the route to gate', () => {
    expect(PLEventPatchBodySchema.safeParse({}).success).toBe(true);
    expect(PLEventPatchBodySchema.safeParse({ locationUrl: null, submit: true, status: 'REJECTED' }).success).toBe(
      true
    );
    expect(issuePaths(PLEventPatchBodySchema, { status: 'DRAFT' })).toEqual(['status']);
  });
});

describe('rule helpers', () => {
  it('reports mixed date kinds', () => {
    expect(eventDateIssues({ startDate: '2026-07-24', endDate: '2026-07-24T10:00:00Z', allDay: true })).toEqual([
      { path: 'endDate', message: 'an all-day event takes dates with no time of day (YYYY-MM-DD)' },
      { path: 'endDate', message: 'startDate and endDate must both have a time of day, or both have none' },
    ]);
  });

  it('lists what a stored draft still lacks for a submission', () => {
    expect(
      eventSubmissionIssues({ endDate: new Date(), timezone: 'UTC', tags: [], hostName: null }, { draft: false }).map(
        (issue) => issue.path
      )
    ).toEqual(['format', 'tags', 'hostName']);
  });
});
