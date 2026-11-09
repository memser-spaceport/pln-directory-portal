import {
  initials,
  personLine,
  renderSuggestedCandidatesEmail,
  requirementsText,
  roleMeta,
  type SuggestedCandidatesEmailCandidate,
  type SuggestedCandidatesEmailInput,
  type SuggestedCandidatesEmailRole,
} from './suggested-candidates-email';

/**
 * LAB-3139: one weekly email per team, up to three roles, two cards per role with one "Why" line each (Figma
 * "Email templates | Protocol Labs" 13252:1368 desktop, 13253:1187 mobile).
 */

const BASE = 'https://directory.example';
const UTM = (content: string, roleUid: string) =>
  `utm_source=job_suggested_candidates_email&utm_medium=email&utm_content=${content}&job_uid=${roleUid}`;
/** An href as it appears in the html: `&` is escaped inside the attribute. */
const attr = (url: string) => `href="${url.replace(/&/g, '&amp;')}"`;

const candidate = (overrides: Partial<SuggestedCandidatesEmailCandidate> = {}): SuggestedCandidatesEmailCandidate => ({
  memberUid: 'm1',
  name: 'Inês Carvalho',
  role: 'Senior Engineer',
  company: 'Saturn',
  location: 'Porto, Portugal',
  imageUrl: null,
  label: 'Strong match',
  blurb: 'Runs Saturn’s retrieval path; four years on Cloudflare’s edge cache.',
  requirements: { met: 5, total: 5 },
  ...overrides,
});

const role = (overrides: Partial<SuggestedCandidatesEmailRole> = {}): SuggestedCandidatesEmailRole => ({
  roleUid: 'role-1',
  roleTitle: 'Senior Engineer',
  matchCount: 5,
  appliedCount: 0,
  candidates: [
    candidate(),
    candidate({
      memberUid: 'm2',
      name: 'Kofi Mensah',
      role: 'Infrastructure Engineer',
      company: 'Filebase',
      location: 'Toronto, Canada',
      blurb: 'Worked with 3 people on your team at Protocol Labs.',
      requirements: { met: 4, total: 5 },
    }),
  ],
  ...overrides,
});

/** The Figma's three roles, 12 members. */
const THREE_ROLES = [
  role(),
  role({
    roleUid: 'role-2',
    roleTitle: 'Product Designer',
    matchCount: 4,
    candidates: [
      candidate({ memberUid: 'm3', name: 'Lena Fischer', blurb: 'Designed the Lotus wallet onboarding flow.' }),
      candidate({ memberUid: 'm4', name: 'Tomás Rivera', label: 'Good match', blurb: 'Led design on Fleek.' }),
    ],
  }),
  role({
    roleUid: 'role-3',
    roleTitle: 'Networking Engineer',
    matchCount: 3,
    candidates: [
      candidate({ memberUid: 'm5', name: 'Amara Okafor' }),
      candidate({ memberUid: 'm6', name: 'Yuki Tanaka', label: 'Good match' }),
    ],
  }),
];

const baseInput = (overrides: Partial<SuggestedCandidatesEmailInput> = {}): SuggestedCandidatesEmailInput => ({
  kind: 'first',
  leadName: 'Maria Silva',
  teamUid: 'team-1',
  teamName: 'Acme',
  roles: THREE_ROLES,
  memberCount: 12,
  newCount: 12,
  newRoleCount: 3,
  preferencesUrl: `${BASE}/settings/email`,
  unsubscribeUrl: `${BASE}/settings/email/unsubscribed?token=v1.a.b`,
  ...overrides,
});

/** Visible text of the html, head, tags and the hidden preheader removed, entities left as-is. */
const visibleText = (html: string) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<div style="display: none;[^"]*">[\s\S]*?<\/div>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

describe('renderSuggestedCandidatesEmail', () => {
  const env = process.env.WEB_UI_BASE_URL;
  beforeEach(() => {
    process.env.WEB_UI_BASE_URL = `${BASE}/`;
  });
  afterEach(() => {
    process.env.WEB_UI_BASE_URL = env;
  });

  describe('scenario: the Figma email, 12 members across 3 roles', () => {
    const { subject, html, text } = (() => {
      process.env.WEB_UI_BASE_URL = `${BASE}/`;
      return renderSuggestedCandidatesEmail(baseInput());
    })();
    const visible = visibleText(html);

    it('has the subject and intro of the design', () => {
      expect(subject).toBe('12 members match 3 of your roles');
      expect(visible).toContain(
        'Hi Maria, 12 members of the Protocol Labs network match 3 of your open roles at Acme. Here are the strongest for each. None have applied yet.'
      );
    });

    it('lists the roles in order, each with its title, View role and "N matches · none have applied"', () => {
      const order = [
        'Senior Engineer View role 5 matches',
        'Product Designer View role 4 matches',
        'Networking Engineer View role 3 matches',
      ];
      const at = order.map((piece) => visible.indexOf(piece));
      expect(at.every((index) => index >= 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(visible).toContain('5 matches · none have applied');
    });

    it('draws each card: name, Strong match, role · company and location, the Why line, the count, View profile', () => {
      expect(visible).toContain(
        'Inês Carvalho Strong match Senior Engineer · Saturn, Porto, Portugal Runs Saturn’s retrieval path; four years on Cloudflare’s edge cache. 5 of 5 requirements View profile'
      );
      expect(visible).toContain('Kofi Mensah Strong match Infrastructure Engineer · Filebase, Toronto, Canada');
    });

    it('marks every card: Strong solid blue, Good a light tint, no gradient', () => {
      expect(html.match(/>Strong match<\/span>/g)).toHaveLength(4);
      expect(html.match(/>Good match<\/span>/g)).toHaveLength(2);
      expect(html).not.toContain('gradient');
      expect(html).toMatch(
        /background-color: #1b4dff; padding: 2px 6px; border-radius: 26px;[^>]*color: #ffffff;[^>]*>Strong match</
      );
      expect(html).toMatch(
        /background-color: #e8edff; padding: 2px 6px; border-radius: 26px;[^>]*color: #1b4dff;[^>]*>Good match</
      );
    });

    it('ends each role with "All N matches for this role" and the email with one Review all button', () => {
      expect(visible).toContain('All 5 matches for this role');
      expect(visible).toContain('All 4 matches for this role');
      expect(visible).toContain('All 3 matches for this role');
      expect(html.match(/>Review all 12 candidates<\/a>/g)).toHaveLength(1);
    });

    it('has no Edit criteria and no "Why we suggested" checklist', () => {
      expect(`${html}\n${text}`).not.toMatch(/Edit criteria|Why we suggested/);
    });

    it('mirrors the html in the text part', () => {
      expect(text).toContain(
        'Hi Maria,\n\n12 members of the Protocol Labs network match 3 of your open roles at Acme.'
      );
      expect(text).toContain('Senior Engineer\nView role: ');
      expect(text).toContain(
        'Inês Carvalho · Strong match\nSenior Engineer · Saturn, Porto, Portugal\nRuns Saturn’s retrieval path; four years on Cloudflare’s edge cache.\n5 of 5 requirements\nView profile: '
      );
      expect(text).toContain('Tomás Rivera · Good match\n');
      expect(text).toContain(`Review all 12 candidates: ${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&`);
    });
  });

  describe('links', () => {
    it('opens each person on their role’s Suggested tab', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      const kofi = `${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&suggested=m2&${UTM('profile', 'role-1')}`;
      const lena = `${BASE}/teams/team-1/applicants?role=role-2&tab=suggested&suggested=m3&${UTM('profile', 'role-2')}`;
      expect(html).toContain(attr(kofi));
      expect(html).toContain(attr(lena));
      expect(text).toContain(`View profile: ${kofi}`);
    });

    it('opens the public posting from View role, and the role’s list from All N matches', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toContain(attr(`${BASE}/jobs/openings/role-2?${UTM('role', 'role-2')}`));
      expect(html).toContain(attr(`${BASE}/teams/team-1/applicants?role=role-3&tab=suggested&${UTM('all', 'role-3')}`));
    });

    it('opens the first role’s Suggested tab from Review all', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toContain(
        attr(`${BASE}/teams/team-1/applicants?role=role-1&tab=suggested&${UTM('review_all', 'role-1')}`)
      );
    });

    it('stretches Review all to the column on a phone', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toContain('.email-button-full { width: 100% !important; }');
      expect(html).toContain('<table role="presentation" class="email-button-full"');
    });
  });

  describe('avatars', () => {
    it('shows the member’s photo, with the initials as its alt text', () => {
      const { html } = renderSuggestedCandidatesEmail(
        baseInput({ roles: [role({ candidates: [candidate({ imageUrl: 'https://img.example/ines.webp' })] })] })
      );
      expect(html).toMatch(/<img src="https:\/\/img\.example\/ines\.webp" width="40" height="40" alt="IC"/);
    });

    it('shows the initials on a tint from the design when there is no photo', () => {
      const { html } = renderSuggestedCandidatesEmail(baseInput({ roles: [role({ candidates: [candidate()] })] }));
      expect(html).toMatch(/background-color: #(dee8ff|dcf4e7|faeadc); text-align: center;[^>]*>IC<\/td>/);
    });

    it.each([
      ['Inês Carvalho', 'IC'],
      ['Tomás de la Rivera', 'TR'],
      ['Cher', 'C'],
      ['  ', ''],
    ])('initials(%s) is %s', (name, expected) => {
      expect(initials(name)).toBe(expected);
    });
  });

  describe('kinds', () => {
    it('new: counts only the new people, in the subject and the intro', () => {
      const { subject, html } = renderSuggestedCandidatesEmail(
        baseInput({ kind: 'new', newCount: 3, newRoleCount: 2 })
      );
      expect(subject).toBe('3 new members match 2 of your roles');
      expect(visibleText(html)).toContain(
        '3 new members of the Protocol Labs network matched your open roles at Acme since last week. Here are the strongest for each. None have applied yet.'
      );
      expect(visibleText(html)).toContain('Review all 12 candidates');
    });

    it('new: one person, one role of several', () => {
      const { subject, html } = renderSuggestedCandidatesEmail(
        baseInput({ kind: 'new', newCount: 1, newRoleCount: 1 })
      );
      expect(subject).toBe('1 new member matches one of your roles');
      expect(visibleText(html)).toContain('1 new member of the Protocol Labs network matched your open roles');
    });

    it('reminder: says nobody new matched, and still shows every card with its Why line', () => {
      const { subject, html } = renderSuggestedCandidatesEmail(
        baseInput({ kind: 'reminder', newCount: 0, newRoleCount: 0 })
      );
      expect(subject).toBe('Your top matches for 3 roles are waiting');
      const visible = visibleText(html);
      expect(visible).toContain(
        'No new members matched your open roles at Acme since last week. Here are your strongest matches.'
      );
      expect(visible).toContain('Runs Saturn’s retrieval path');
      expect(html.match(/>View profile<\/a>/g)).toHaveLength(6);
    });

    it('names the role when the email covers one', () => {
      const one = { roles: [role()], memberCount: 5, newCount: 5, newRoleCount: 1 };
      expect(renderSuggestedCandidatesEmail(baseInput(one)).subject).toBe('5 members match your Senior Engineer role');
      expect(visibleText(renderSuggestedCandidatesEmail(baseInput(one)).html)).toContain(
        '5 members of the Protocol Labs network match your open Senior Engineer role at Acme. Here are the strongest. None have applied yet.'
      );
      expect(renderSuggestedCandidatesEmail(baseInput({ ...one, kind: 'new', newCount: 2 })).subject).toBe(
        '2 new members match your Senior Engineer role'
      );
      expect(renderSuggestedCandidatesEmail(baseInput({ ...one, kind: 'reminder' })).subject).toBe(
        'Your top matches for Senior Engineer are waiting'
      );
    });
  });

  describe('applied counts', () => {
    it.each([
      [0, '5 matches · none have applied'],
      [1, '5 matches · 1 has applied'],
      [2, '5 matches · 2 have applied'],
    ])('roleMeta with %i applied', (appliedCount, expected) => {
      expect(roleMeta({ matchCount: 5, appliedCount })).toBe(expected);
    });

    it('says "1 match"', () => {
      expect(roleMeta({ matchCount: 1, appliedCount: 0 })).toBe('1 match · none have applied');
    });

    it('drops "None have applied yet." from the intro once anyone has applied', () => {
      const roles = [role({ appliedCount: 1 }), ...THREE_ROLES.slice(1)];
      expect(visibleText(renderSuggestedCandidatesEmail(baseInput({ roles })).html)).not.toContain('None have applied');
    });
  });

  describe('missing optional fields', () => {
    it('drops unknown parts of the person line', () => {
      expect(personLine({ role: 'Engineer', company: null, location: null })).toBe('Engineer');
      expect(personLine({ role: null, company: 'Saturn', location: 'Porto, Portugal' })).toBe(
        'Saturn, Porto, Portugal'
      );
      expect(personLine({ role: null, company: null, location: null })).toBe('');
    });

    it('draws no Why line and no count when the run had none', () => {
      const { html, text } = renderSuggestedCandidatesEmail(
        baseInput({ roles: [role({ candidates: [candidate({ blurb: null, requirements: null })] })] })
      );
      expect(html).not.toContain('Runs Saturn');
      expect(html).not.toContain('requirements');
      expect(text).toContain('Senior Engineer · Saturn, Porto, Portugal\nView profile: ');
    });

    it('requirementsText', () => {
      expect(requirementsText({ met: 4, total: 5 })).toBe('4 of 5 requirements');
      expect(requirementsText({ met: 1, total: 1 })).toBe('1 of 1 requirement');
      expect(requirementsText({ met: 0, total: 0 })).toBe('');
      expect(requirementsText(null)).toBe('');
    });

    it('greets without a name when there is none', () => {
      expect(visibleText(renderSuggestedCandidatesEmail(baseInput({ leadName: '' })).html)).toContain('Hi, 12 members');
    });
  });

  describe('footer', () => {
    it('signs off from the LabOS team and gives the network reason', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(visibleText(html)).toContain(
        'Cheers, The LabOS Team You received this email because you are a member of the Protocol Labs network.'
      );
      expect(text).toContain(
        'Cheers,\nThe LabOS Team\n\nYou received this email because you are a member of the Protocol Labs network.\n'
      );
    });

    it('keeps Unsubscribe next to Manage, with the input URLs untouched', () => {
      const { html, text } = renderSuggestedCandidatesEmail(baseInput());
      expect(html).toMatch(
        new RegExp(
          `<a href="${BASE}/settings/email" style="[^"]*text-decoration: underline;">Manage</a> your email preferences &middot; <a href="${BASE}/settings/email/unsubscribed\\?token=v1\\.a\\.b" style="[^"]*">Unsubscribe</a>`
        )
      );
      expect(text).toContain(`Manage your email preferences: ${BASE}/settings/email\n`);
      expect(text).toContain(`Unsubscribe: ${BASE}/settings/email/unsubscribed?token=v1.a.b`);
    });
  });

  describe('escaping', () => {
    const hostile = baseInput({
      leadName: '<b>Ada</b> Lovelace',
      teamName: "Ada's <Team>",
      roles: [
        role({
          roleTitle: 'Rust & "Go" Engineer',
          candidates: [
            candidate({
              name: 'Grace <script>alert(1)</script>',
              role: '<i>CTO</i>',
              company: '<u>Co</u>',
              location: 'Boston <b>&</b> Co',
              blurb: 'Met & <em>proven</em>',
              imageUrl: 'https://img.example/a.png?x="1"',
            }),
          ],
        }),
      ],
      preferencesUrl: `${BASE}/settings/email?a=1&b="2"`,
      unsubscribeUrl: `${BASE}/settings/email/unsubscribed?token=v1.a.b&x=<y>`,
    });

    it('shows HTML special characters in every field as text', () => {
      const { html } = renderSuggestedCandidatesEmail(hostile);
      for (const raw of [
        '<b>Ada</b>',
        '<script>',
        '<Team>',
        '<i>',
        '<u>',
        '<em>',
        'x=<y>',
        'b="2"',
        'x="1"',
        '<b>&</b>',
      ]) {
        expect(html).not.toContain(raw);
      }
      expect(html).toContain('Hi &lt;b&gt;Ada&lt;/b&gt;,');
      expect(html).toContain('Rust &amp; &quot;Go&quot; Engineer');
      expect(html).toContain('Ada&#39;s &lt;Team&gt;');
      expect(html).toContain('Grace &lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Met &amp; &lt;em&gt;proven&lt;/em&gt;');
      expect(html).toContain('href="https://directory.example/settings/email?a=1&amp;b=&quot;2&quot;"');
    });

    it('keeps the subject and text part as plain text, one line per field', () => {
      const { subject, text } = renderSuggestedCandidatesEmail(
        baseInput({
          roles: [role({ roleTitle: 'Rust &\nGo', candidates: [candidate({ name: 'Grace\nHopper', blurb: 'a\nb' })] })],
          memberCount: 1,
        })
      );
      expect(subject).toBe('1 member matches your Rust & Go role');
      expect(text).toContain('Grace Hopper · Strong match');
      expect(text).toContain('\na b\n');
    });
  });

  it('never mentions job-search status', () => {
    const { html, text } = renderSuggestedCandidatesEmail(baseInput());
    expect(`${html}\n${text}`).not.toMatch(/looking|job[- ]search/i);
  });

  describe('refuses to build an email with a broken link', () => {
    it('throws on no roles', () => {
      expect(() => renderSuggestedCandidatesEmail(baseInput({ roles: [] }))).toThrow(
        'renderSuggestedCandidatesEmail: at least one role is required'
      );
    });

    it('throws on a role with no candidate', () => {
      expect(() => renderSuggestedCandidatesEmail(baseInput({ roles: [role({ candidates: [] })] }))).toThrow(
        'renderSuggestedCandidatesEmail: roles[0] needs at least one candidate'
      );
    });

    it('throws on a missing teamUid, roleUid or memberUid', () => {
      expect(() => renderSuggestedCandidatesEmail(baseInput({ teamUid: ' ' }))).toThrow('teamUid is required');
      expect(() => renderSuggestedCandidatesEmail(baseInput({ roles: [role({ roleUid: '' })] }))).toThrow(
        'roles[0].roleUid is required'
      );
      expect(() =>
        renderSuggestedCandidatesEmail(baseInput({ roles: [role({ candidates: [candidate({ memberUid: '' })] })] }))
      ).toThrow('roles[0].candidates[0].memberUid is required');
    });
  });

  it('loads the logo and the arrow icon from the directory domain, and no SVG', () => {
    const { html } = renderSuggestedCandidatesEmail(baseInput());
    expect(html).toContain(
      `<img src="${BASE}/images/email/email-logo-protocol-labs@2x.png" width="193" height="44" alt="Protocol Labs"`
    );
    expect(html).toContain(`src="${BASE}/images/email/email-icon-arrow@2x.png" width="14" height="14"`);
    expect(html).not.toContain('pfps.plnetwork.io');
    expect(html).not.toContain('.svg');
  });

  it('is an email-safe document: tables, inline styles, a 640px fluid column, no flex or grid', () => {
    const { html } = renderSuggestedCandidatesEmail(baseInput());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<table role="presentation"');
    expect(html).toMatch(/class="email-container" role="presentation" width="640"/);
    // Intro, role sections and button share one 520px column on desktop (Figma, widened 2026-11-09).
    expect(html.match(/class="email-fluid" role="presentation" width="(\d+)"/g)).toEqual(
      Array(3).fill('class="email-fluid" role="presentation" width="520"')
    );
    expect(html).toContain('@media only screen and (max-width: 640px)');
    expect(html).not.toMatch(/display:\s*(flex|grid)/);
    expect(html.match(/<link /g)).toHaveLength(1);
    expect(html).toContain(
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&amp;family=Montserrat'
    );
  });
});
