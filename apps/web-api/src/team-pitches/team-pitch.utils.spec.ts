import { DEFAULT_TEAM_PITCH_SUPPORT_EMAIL, resolveTeamPitchSupportEmail } from './team-pitch.utils';

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
