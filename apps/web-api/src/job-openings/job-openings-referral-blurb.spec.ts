import { deriveReferralBlurb } from './job-openings-referral-blurb';

describe('deriveReferralBlurb', () => {
  it('returns null when there is no usable bio', () => {
    expect(deriveReferralBlurb(null)).toBeNull();
    expect(deriveReferralBlurb('')).toBeNull();
    expect(deriveReferralBlurb('<p></p>')).toBeNull();
  });

  it('strips markup from an entity-free bio', () => {
    expect(deriveReferralBlurb('<p>Plain bio here.</p>')).toBe('Plain bio here.');
  });

  it('decodes the escaped quotes an AI/Quill bio contains', () => {
    // The reported repro: these rendered literally as &quot; in the referral note.
    expect(deriveReferralBlurb('<p>Self Registered serves as Team Lead for &quot;Team A&quot;.</p>')).toBe(
      'Self Registered serves as Team Lead for "Team A".'
    );
  });

  it('decodes angle brackets, ampersands and both apostrophe forms', () => {
    expect(deriveReferralBlurb('<p>Ships &lt;1s builds &amp; loves O&#39;Brien&apos;s work.</p>')).toBe(
      "Ships <1s builds & loves O'Brien's work."
    );
  });

  it('decodes &amp; last so double-encoded entities survive exactly one level', () => {
    // Decoding &amp; first would collapse `&amp;quot;` to `"` instead of `&quot;`.
    expect(deriveReferralBlurb('<p>Wrote &amp;quot;hi&amp;quot; and R&amp;D.</p>')).toBe(
      'Wrote &quot;hi&quot; and R&D.'
    );
  });

  it('strips tags before decoding, so escaped markup stays visible text', () => {
    // Decoding first would turn `&lt;b&gt;` into a real tag the strip pass then eats.
    expect(deriveReferralBlurb('<p>Wrote &lt;b&gt;bold&lt;/b&gt; markup.</p>')).toBe('Wrote <b>bold</b> markup.');
  });

  it('collapses both &nbsp; and a literal U+00A0', () => {
    expect(deriveReferralBlurb('<p>A&nbsp;B\u00A0C.</p>')).toBe('A B C.');
  });

  it('still drops the AI disclaimer sentence', () => {
    expect(
      deriveReferralBlurb('<p>She leads infra.</p><p><em>Bio is AI generated &amp; may not be accurate.</em></p>')
    ).toBe('She leads infra.');
  });

  it('drops the AI disclaimer in its Quill-saved &nbsp; form too', () => {
    expect(
      deriveReferralBlurb(
        '<p>She leads infra.</p><p><em>Bio&nbsp;is&nbsp;AI&nbsp;generated &amp; may not be accurate.</em></p>'
      )
    ).toBe('She leads infra.');
  });

  it('measures the 220-char budget against decoded text', () => {
    // 8 escaped quotes cost 48 characters encoded but only 8 decoded. Before the fix
    // that entity noise pushed this sentence past MAX_BLURB_CHARS and dropped it
    // entirely; the budget should measure prose, not markup.
    const filler = 'a'.repeat(200);
    const decodedQuotes = '"'.repeat(8);

    expect(deriveReferralBlurb(`<p>${filler} ${'&quot;'.repeat(8)}.</p>`)).toBe(`${filler} ${decodedQuotes}.`);
  });

  it('still stops at MAX_BLURB_CHARS once the decoded text is genuinely too long', () => {
    const longSentence = `${'b'.repeat(230)}.`;

    expect(deriveReferralBlurb(`<p>Short one. ${longSentence}</p>`)).toBe('Short one.');
  });
});
