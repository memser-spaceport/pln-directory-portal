import { jobBoardDetailUrl, memberProfileEmailUrl } from './job-openings-url';

describe('jobBoardDetailUrl', () => {
  const originalWeb = process.env.WEB_UI_BASE_URL;
  const originalApp = process.env.APPLICATION_BASE_URL;

  afterEach(() => {
    process.env.WEB_UI_BASE_URL = originalWeb;
    process.env.APPLICATION_BASE_URL = originalApp;
  });

  it('builds /jobs/openings/<uid> on WEB_UI_BASE_URL, stripping a trailing slash', () => {
    process.env.WEB_UI_BASE_URL = 'https://directory.test/';

    expect(jobBoardDetailUrl('role-1')).toBe('https://directory.test/jobs/openings/role-1');
  });

  it('encodes a uid that would break the path', () => {
    process.env.WEB_UI_BASE_URL = 'https://directory.test';

    expect(jobBoardDetailUrl('role with space&x')).toBe('https://directory.test/jobs/openings/role%20with%20space%26x');
  });

  it('falls back to APPLICATION_BASE_URL and refuses the old plnetwork.io host', () => {
    delete process.env.WEB_UI_BASE_URL;
    process.env.APPLICATION_BASE_URL = 'https://os.pl.xyz';
    expect(jobBoardDetailUrl('role-1')).toBe('https://os.pl.xyz/jobs/openings/role-1');

    delete process.env.APPLICATION_BASE_URL;
    expect(() => jobBoardDetailUrl('role-1')).toThrow(/WEB_UI_BASE_URL or APPLICATION_BASE_URL must be set/);
  });
});

describe('memberProfileEmailUrl', () => {
  const originalWeb = process.env.WEB_UI_BASE_URL;

  afterEach(() => {
    process.env.WEB_UI_BASE_URL = originalWeb;
  });

  it('carries the UTMs the profile page reads back to attribute the click', () => {
    process.env.WEB_UI_BASE_URL = 'https://directory.test/';

    expect(
      memberProfileEmailUrl('member-1', { source: 'job_referral_email', content: 'referred', jobUid: 'job-1' })
    ).toBe(
      'https://directory.test/members/member-1?utm_source=job_referral_email&utm_medium=email&utm_content=referred&job_uid=job-1'
    );
  });
});
