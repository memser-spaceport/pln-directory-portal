import type { SignUpMember } from './member-sign-up-notifications.types';
import { memberSignUpTelegramText } from './member-sign-up-message';

const buildMember = (overrides: Partial<SignUpMember> = {}): SignUpMember => ({
  uid: 'member-1',
  name: 'Ada <Lovelace>',
  email: 'ada@example.com',
  role: 'Engineer',
  linkedinHandler: 'ada',
  signUpSource: 'job-board',
  signUpMedium: 'email',
  signUpCampaign: null,
  jobSearchStatus: null,
  teamMemberRoles: [
    { mainTeam: false, team: { name: 'Side' } },
    { mainTeam: true, team: { name: 'Acme & Co' } },
  ],
  policyAssignmentsV2: [],
  ...overrides,
});

describe('memberSignUpTelegramText', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, WEB_UI_BASE_URL: 'https://directory.test/', WEB_ADMIN_UI_BASE_URL: 'https://admin.test' };
  });

  afterEach(() => {
    process.env = env;
  });

  it('lists the member with escaped values, the main team first and links', () => {
    expect(memberSignUpTelegramText('SIGN_UP', buildMember()).split('\n')).toEqual([
      '🆕 New sign-up',
      'Name: <a href="https://directory.test/members/member-1">Ada &lt;Lovelace&gt;</a>',
      'Email: ada@example.com',
      'Team: Acme &amp; Co, Side',
      'Role: Engineer',
      'LinkedIn: <a href="https://www.linkedin.com/in/ada">ada</a>',
      'Source: job-board / email',
      '<a href="https://admin.test/members?filter=level0&amp;search=ada%40example.com">Open in back office</a>',
    ]);
  });

  it('shows a dash for empty fields', () => {
    const text = memberSignUpTelegramText(
      'SIGN_UP',
      buildMember({ role: null, linkedinHandler: null, signUpSource: null, signUpMedium: null, teamMemberRoles: [] })
    );

    expect(text).toContain('Team: -');
    expect(text).toContain('Role: -');
    expect(text).toContain('LinkedIn: -');
    expect(text).toContain('Source: -');
  });

  it('tags a Job Aspirant and adds the job search status', () => {
    const member = buildMember({
      policyAssignmentsV2: [{ uid: 'assignment-1' }],
      jobSearchStatus: 'ACTIVELY_LOOKING',
    } as Partial<SignUpMember>);

    const lines = memberSignUpTelegramText('SIGN_UP', member).split('\n');

    expect(lines[0]).toBe('🆕 New sign-up · 💼 Job Aspirant');
    expect(lines).toContain('Job search: ACTIVELY_LOOKING');
  });

  it('opens the verified tab for a LinkedIn verification', () => {
    const text = memberSignUpTelegramText('LINKEDIN_VERIFIED', buildMember());

    expect(text.split('\n')[0]).toBe('✅ LinkedIn verified');
    expect(text).toContain('filter=level1');
  });

  it('does not repeat the Job Aspirant tag in the Job Aspirant channel', () => {
    const member = buildMember({ policyAssignmentsV2: [{ uid: 'assignment-1' }] } as Partial<SignUpMember>);

    expect(memberSignUpTelegramText('JOB_ASPIRANT_SIGN_UP', member).split('\n')[0]).toBe('💼 New Job Aspirant sign-up');
  });
});
