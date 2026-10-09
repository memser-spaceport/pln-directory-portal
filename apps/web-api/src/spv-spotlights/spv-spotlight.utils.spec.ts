import {
  accessRequestConflict,
  mergeTemplate,
  openNoticeCounts,
  replaceNbsp,
  resolveViewerAccess,
  sanitizeEmailHtml,
  visibleDocSendUrl,
} from './spv-spotlight.utils';

describe('resolveViewerAccess', () => {
  it('is NONE without a token', () => {
    expect(resolveViewerAccess({ hasToken: false, requestStatus: 'APPROVED', isPreApproved: true })).toBe('NONE');
  });

  it('keeps a rejection ahead of pre-approval', () => {
    expect(resolveViewerAccess({ hasToken: true, requestStatus: 'REJECTED', isPreApproved: true })).toBe('REJECTED');
  });

  it('approves a pre-approved member and an approved request', () => {
    expect(resolveViewerAccess({ hasToken: true, requestStatus: null, isPreApproved: true })).toBe('APPROVED');
    expect(resolveViewerAccess({ hasToken: true, requestStatus: 'APPROVED', isPreApproved: false })).toBe('APPROVED');
  });

  it('approves a founder participant, also over an old rejection', () => {
    expect(resolveViewerAccess({ hasToken: true, requestStatus: null, isPreApproved: false, isFounder: true })).toBe(
      'APPROVED'
    );
    expect(
      resolveViewerAccess({ hasToken: true, requestStatus: 'REJECTED', isPreApproved: false, isFounder: true })
    ).toBe('APPROVED');
    expect(resolveViewerAccess({ hasToken: false, requestStatus: null, isPreApproved: false, isFounder: true })).toBe(
      'NONE'
    );
  });

  it('returns PENDING then NONE', () => {
    expect(resolveViewerAccess({ hasToken: true, requestStatus: 'PENDING', isPreApproved: false })).toBe('PENDING');
    expect(resolveViewerAccess({ hasToken: true, requestStatus: null, isPreApproved: false })).toBe('NONE');
  });
});

describe('accessRequestConflict', () => {
  it('blocks a rejected investor from applying again', () => {
    expect(accessRequestConflict({ requestStatus: 'REJECTED', isPreApproved: false })).toBe('REJECTED');
  });

  it('tells a pre-approved investor to sign in', () => {
    expect(accessRequestConflict({ requestStatus: null, isPreApproved: true })).toBe('PRE_APPROVED');
  });

  it('treats pending and approved as already applied', () => {
    expect(accessRequestConflict({ requestStatus: 'PENDING', isPreApproved: false })).toBe('ALREADY_APPLIED');
    expect(accessRequestConflict({ requestStatus: 'APPROVED', isPreApproved: false })).toBe('ALREADY_APPLIED');
  });

  it('allows a first request', () => {
    expect(accessRequestConflict({ requestStatus: null, isPreApproved: false })).toBeNull();
  });
});

describe('mergeTemplate', () => {
  it('replaces known tokens and blanks unknown ones', () => {
    expect(mergeTemplate('Hi {{investorName}} {{missing}}', { investorName: 'Ada' })).toBe('Hi Ada ');
  });

  it('uses the fallback when a value is missing or empty', () => {
    expect(mergeTemplate('From {{firm|a fund}}, {{note | none}}', { note: '' })).toBe('From a fund, none');
    expect(mergeTemplate('From {{firm|a fund}}', { firm: 'Gamma' })).toBe('From Gamma');
  });
});

describe('replaceNbsp', () => {
  it('turns non-breaking spaces into normal spaces', () => {
    expect(replaceNbsp('<p>a&nbsp;b c</p>')).toBe('<p>a b c</p>');
  });
});

describe('sanitizeEmailHtml', () => {
  it('strips scripts, iframes, and event handlers and keeps images', () => {
    const html = `<p onclick="alert(1)">Hi</p><script>alert(1)</script><img src="https://example.com/logo.png" alt="PL"><iframe src="https://evil"></iframe>`;
    const clean = sanitizeEmailHtml(html);
    expect(clean).toContain('<img src="https://example.com/logo.png" alt="PL">');
    expect(clean).not.toContain('script');
    expect(clean).not.toContain('iframe');
    expect(clean).not.toContain('onclick');
  });
});

describe('visibleDocSendUrl', () => {
  it('returns the url only for an approved viewer while the spotlight is open', () => {
    expect(visibleDocSendUrl('OPEN', 'APPROVED', 'https://docsend.com/view/abc')).toBe('https://docsend.com/view/abc');
    expect(visibleDocSendUrl('DRAFT', 'APPROVED', 'https://docsend.com/view/abc')).toBeNull();
    expect(visibleDocSendUrl('OPEN', 'NONE', 'https://docsend.com/view/abc')).toBeNull();
    expect(visibleDocSendUrl('CLOSED', 'APPROVED', 'https://docsend.com/view/abc')).toBeNull();
  });
});
describe('openNoticeCounts', () => {
  it('splits people who have not been emailed from people who have', () => {
    expect(openNoticeCounts([{ sent: false }, { sent: true }, { sent: false }])).toEqual({
      willReceive: 2,
      alreadySent: 1,
    });
  });
});
