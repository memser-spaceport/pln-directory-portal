import { deriveTeamFieldsFromLeads } from './team-enrichment-lead-backfill';

const blankLead = {
  email: null,
  twitterHandler: null,
  linkedinHandler: null,
  telegramHandler: null,
};

describe('deriveTeamFieldsFromLeads', () => {
  describe('contactMethod (email)', () => {
    it('picks lead email whose domain matches the team website host', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, email: 'jane@acme.com' },
      ]);
      expect(out.contactMethod).toBe('jane@acme.com');
    });

    it('normalizes www. and accepts subdomain emails', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://www.acme.com', [
        { ...blankLead, email: 'team@mail.acme.com' },
      ]);
      expect(out.contactMethod).toBe('team@mail.acme.com');
    });

    it('REJECTS personal email (gmail, etc.)', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, email: 'jane@gmail.com' },
      ]);
      expect(out.contactMethod).toBeUndefined();
    });

    it('REJECTS email whose domain just contains the team name as substring', () => {
      // Team "Eon" with lead email on "beontop.com" — `acme` /`eon` appears
      // mid-word, but it's not the website host. Reject.
      const out = deriveTeamFieldsFromLeads('Eon', 'https://eon.systems', [
        { ...blankLead, email: 'jane@beontop.com' },
      ]);
      expect(out.contactMethod).toBeUndefined();
    });

    it('skips silently when website is unknown', () => {
      const out = deriveTeamFieldsFromLeads('Acme', null, [{ ...blankLead, email: 'jane@acme.com' }]);
      expect(out.contactMethod).toBeUndefined();
    });

    it('picks the first matching lead when multiple have team-domain emails', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, email: 'jane@acme.com' },
        { ...blankLead, email: 'bob@acme.com' },
      ]);
      expect(out.contactMethod).toBe('jane@acme.com');
    });
  });

  describe('twitterHandler', () => {
    it('accepts lead twitter handle whose first label starts with team token', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, twitterHandler: '@acmehq' },
      ]);
      expect(out.twitterHandler).toBe('acmehq');
    });

    it('REJECTS lead personal twitter that does NOT start with team token', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, twitterHandler: '@janedoe' },
      ]);
      expect(out.twitterHandler).toBeUndefined();
    });

    it('rejects mid-word substring match (prefix-only guard)', () => {
      const out = deriveTeamFieldsFromLeads('Eon', 'https://eon.systems', [
        { ...blankLead, twitterHandler: '@beontop' },
      ]);
      expect(out.twitterHandler).toBeUndefined();
    });

    it('strips @ from result', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, twitterHandler: '@acme_team' },
      ]);
      expect(out.twitterHandler).toBe('acme_team');
    });
  });

  describe('telegramHandler', () => {
    it('accepts lead telegram handle starting with team token', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, telegramHandler: 'acme_chat' },
      ]);
      expect(out.telegramHandler).toBe('acme_chat');
    });

    it('REJECTS lead personal telegram unrelated to team name', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, telegramHandler: 'janedoe' },
      ]);
      expect(out.telegramHandler).toBeUndefined();
    });
  });

  describe('linkedinHandler', () => {
    it('NEVER returns linkedinHandler from a lead (different format — personal vs company)', () => {
      // Member.linkedinHandler is the lead's personal `in/<name>` profile, not
      // the team's `company/<slug>` page. The function intentionally omits this.
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, linkedinHandler: 'company/acme-labs' },
      ]);
      expect((out as any).linkedinHandler).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('empty leads array → empty result', () => {
      expect(deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [])).toEqual({});
    });

    it('all leads have null contacts → empty result', () => {
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [blankLead, blankLead]);
      expect(out).toEqual({});
    });

    it('mixes: picks every field that matches, omits the rest', () => {
      // Jane is personal twitter, won't match. Bob has team-domain email.
      // Neither has a team-shaped telegram.
      const out = deriveTeamFieldsFromLeads('Acme', 'https://acme.com', [
        { ...blankLead, email: 'jane@gmail.com', twitterHandler: '@janedoe' },
        { ...blankLead, email: 'bob@acme.com', telegramHandler: 'bob_personal' },
      ]);
      expect(out.contactMethod).toBe('bob@acme.com');
      expect(out.twitterHandler).toBeUndefined();
      expect(out.telegramHandler).toBeUndefined();
    });
  });
});
