import {
  DEFAULT_TEAM_PITCH_SUPPORT_EMAIL,
  resolveTeamPitchSupportEmail,
  resolveTeamPitchSenderEmail,
  resolveTeamPitchClosedAt,
} from './team-pitch.utils';

describe('resolveTeamPitchSupportEmail', () => {
  const originalLabosSupportEmail = process.env.LABOS_SUPPORT_EMAIL;
  const originalDemoDayEmail = process.env.DEMO_DAY_EMAIL;

  afterEach(() => {
    if (originalLabosSupportEmail === undefined) {
      delete process.env.LABOS_SUPPORT_EMAIL;
    } else {
      process.env.LABOS_SUPPORT_EMAIL = originalLabosSupportEmail;
    }

    if (originalDemoDayEmail === undefined) {
      delete process.env.DEMO_DAY_EMAIL;
    } else {
      process.env.DEMO_DAY_EMAIL = originalDemoDayEmail;
    }
  });

  it('returns the provided email when set', () => {
    expect(resolveTeamPitchSupportEmail('team@example.com')).toBe('team@example.com');
  });

  it('trims whitespace from the provided email', () => {
    expect(resolveTeamPitchSupportEmail('  team@example.com  ')).toBe('team@example.com');
  });

  it('falls back to LABOS_SUPPORT_EMAIL when input is blank', () => {
    process.env.LABOS_SUPPORT_EMAIL = 'labos@example.com';
    delete process.env.DEMO_DAY_EMAIL;

    expect(resolveTeamPitchSupportEmail('')).toBe('labos@example.com');
    expect(resolveTeamPitchSupportEmail()).toBe('labos@example.com');
  });

  it('falls back to DEMO_DAY_EMAIL when LABOS_SUPPORT_EMAIL is unset', () => {
    delete process.env.LABOS_SUPPORT_EMAIL;
    process.env.DEMO_DAY_EMAIL = 'demoday@example.com';

    expect(resolveTeamPitchSupportEmail('')).toBe('demoday@example.com');
  });

  it('falls back to the default support email when env vars are unset', () => {
    delete process.env.LABOS_SUPPORT_EMAIL;
    delete process.env.DEMO_DAY_EMAIL;

    expect(resolveTeamPitchSupportEmail('')).toBe(DEFAULT_TEAM_PITCH_SUPPORT_EMAIL);
  });
});

describe('resolveTeamPitchSenderEmail', () => {
  const originalLabosSupportEmail = process.env.LABOS_SUPPORT_EMAIL;
  const originalDemoDayEmail = process.env.DEMO_DAY_EMAIL;

  afterEach(() => {
    if (originalLabosSupportEmail === undefined) {
      delete process.env.LABOS_SUPPORT_EMAIL;
    } else {
      process.env.LABOS_SUPPORT_EMAIL = originalLabosSupportEmail;
    }

    if (originalDemoDayEmail === undefined) {
      delete process.env.DEMO_DAY_EMAIL;
    } else {
      process.env.DEMO_DAY_EMAIL = originalDemoDayEmail;
    }
  });

  it('returns the provided email when set', () => {
    expect(resolveTeamPitchSenderEmail('sender@example.com')).toBe('sender@example.com');
  });

  it('falls back to DEMO_DAY_EMAIL when input is blank', () => {
    process.env.DEMO_DAY_EMAIL = 'demoday@example.com';
    delete process.env.LABOS_SUPPORT_EMAIL;

    expect(resolveTeamPitchSenderEmail('')).toBe('demoday@example.com');
    expect(resolveTeamPitchSenderEmail()).toBe('demoday@example.com');
  });

  it('falls back to LABOS_SUPPORT_EMAIL when DEMO_DAY_EMAIL is unset', () => {
    delete process.env.DEMO_DAY_EMAIL;
    process.env.LABOS_SUPPORT_EMAIL = 'labos@example.com';

    expect(resolveTeamPitchSenderEmail(null)).toBe('labos@example.com');
  });

  it('falls back to the default when env vars are unset', () => {
    delete process.env.DEMO_DAY_EMAIL;
    delete process.env.LABOS_SUPPORT_EMAIL;

    expect(resolveTeamPitchSenderEmail('')).toBe(DEFAULT_TEAM_PITCH_SUPPORT_EMAIL);
  });
});

describe('resolveTeamPitchClosedAt', () => {
  it('returns null when pitch is not closed', () => {
    expect(
      resolveTeamPitchClosedAt({
        status: 'OPEN',
        closedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      })
    ).toBeNull();
  });

  it('returns closedAt when set on a closed pitch', () => {
    const closedAt = new Date('2026-03-15T12:00:00.000Z');
    expect(
      resolveTeamPitchClosedAt({
        status: 'CLOSED',
        closedAt,
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      })
    ).toBe(closedAt.toISOString());
  });

  it('falls back to updatedAt when closedAt is missing', () => {
    const updatedAt = new Date('2026-04-01T00:00:00.000Z');
    expect(
      resolveTeamPitchClosedAt({
        status: 'CLOSED',
        closedAt: null,
        updatedAt,
      })
    ).toBe(updatedAt.toISOString());
  });
});
