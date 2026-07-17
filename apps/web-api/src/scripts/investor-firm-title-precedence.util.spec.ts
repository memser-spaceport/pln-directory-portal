import {
  extractFirmTitleFromBio,
  resolveInvestorFirmAndTitle,
} from './investor-firm-title-precedence.util';

const SAM_BIO =
  'Sam Altman is the CEO of OpenAI, a co-founder of Hydrazine Capital, and Managing Director of Apollo Projects. He previously served as President of Y Combinator.';

describe('extractFirmTitleFromBio', () => {
  it('takes the first present-tense ROLE of ORG (Sam)', () => {
    expect(extractFirmTitleFromBio(SAM_BIO)).toEqual({ firm: 'OpenAI', title: 'CEO' });
  });

  it('skips past-tense clauses', () => {
    expect(
      extractFirmTitleFromBio('She previously served as President of Y Combinator. She is now a Partner at a16z.'),
    ).toEqual({ firm: 'a16z', title: 'Partner' });
  });

  it('returns null when bio has no ROLE of/at ORG', () => {
    expect(extractFirmTitleFromBio('Active angel investor based in San Francisco.')).toBeNull();
  });

  it('returns null for empty bio', () => {
    expect(extractFirmTitleFromBio(null)).toBeNull();
    expect(extractFirmTitleFromBio('')).toBeNull();
  });
});

describe('resolveInvestorFirmAndTitle', () => {
  it('Sam-like: Affinity Oklo/President + OpenAI bio → OpenAI / CEO', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Oklo',
        affinityTitle: 'President',
        enrichment: { bio: SAM_BIO },
      }),
    ).toEqual({ firm: 'OpenAI', title: 'CEO', source: 'enrichment' });
  });

  it('falls back to Affinity when enrichment is missing', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Oklo',
        affinityTitle: 'President',
        enrichment: null,
      }),
    ).toEqual({ firm: 'Oklo', title: 'President', source: 'affinity' });
  });

  it('falls back to Affinity when bio has no extractable role', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Oklo',
        affinityTitle: 'President',
        enrichment: { bio: 'Angel investor focused on deep tech.' },
      }),
    ).toEqual({ firm: 'Oklo', title: 'President', source: 'affinity' });
  });

  it('prefers structured enrichment firm/title over bio and Affinity', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Oklo',
        affinityTitle: 'President',
        enrichment: {
          firm: 'OpenAI',
          title: 'CEO',
          bio: 'Also Managing Director of Apollo Projects.',
        },
      }),
    ).toEqual({ firm: 'OpenAI', title: 'CEO', source: 'enrichment' });
  });

  it('uses structured firm with Affinity title when only firm is structured', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Oklo',
        affinityTitle: 'President',
        enrichment: { firm: 'OpenAI', bio: SAM_BIO },
      }),
    ).toEqual({ firm: 'OpenAI', title: 'President', source: 'enrichment' });
  });

  it('does not override when bio is past-tense only', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Oklo',
        affinityTitle: 'President',
        enrichment: {
          bio: 'He previously served as President of Y Combinator and was formerly CEO of a startup.',
        },
      }),
    ).toEqual({ firm: 'Oklo', title: 'President', source: 'affinity' });
  });

  it('multi-role present tense uses first match', () => {
    expect(
      resolveInvestorFirmAndTitle({
        affinityFirm: 'Acme',
        affinityTitle: 'Advisor',
        enrichment: {
          bio: 'Jane is a Partner at Sequoia and Managing Director of Apollo Projects.',
        },
      }),
    ).toEqual({ firm: 'Sequoia', title: 'Partner', source: 'enrichment' });
  });
});
