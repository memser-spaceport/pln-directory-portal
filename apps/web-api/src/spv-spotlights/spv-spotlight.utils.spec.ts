import {
  accessRequestConflict,
  assignSenders,
  batchSendDurationMs,
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

  it('keeps one branch of an if block', () => {
    const template = '{{#if f25WarmList}}warm{{else}}backed {{sector_hook}}{{/if}}';
    expect(mergeTemplate(template, { f25WarmList: 'yes', sector_hook: 'climate' })).toBe('warm');
    expect(mergeTemplate(template, { f25WarmList: '  ', sector_hook: 'climate' })).toBe('backed climate');
    expect(mergeTemplate(template, { sector_hook: 'climate' })).toBe('backed climate');
  });

  it('uses else if when an earlier flag is empty', () => {
    const template =
      '{{#if f25_warm_list}}A{{else if sector_hook}}backed {{sector_hook}}{{else}}C{{/if}}';
    expect(mergeTemplate(template, { f25_warm_list: 'yes', sector_hook: 'climate' })).toBe('A');
    expect(mergeTemplate(template, { sector_hook: 'climate' })).toBe('backed climate');
    expect(mergeTemplate(template, {})).toBe('C');
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
  const url = 'https://docsend.com/view/abc';

  it('returns the url only for an approved viewer while the spotlight is open', () => {
    expect(visibleDocSendUrl('OPEN', 'APPROVED', url)).toBe(url);
    expect(visibleDocSendUrl('DRAFT', 'APPROVED', url)).toBeNull();
    expect(visibleDocSendUrl('OPEN', 'NONE', url)).toBeNull();
    expect(visibleDocSendUrl('CLOSED', 'APPROVED', url)).toBeNull();
  });
});

describe('assignSenders', () => {
  it('splits an odd list so the counts differ by one', () => {
    const assigned = assignSenders(
      [{ memberUid: 'c' }, { memberUid: 'a' }, { memberUid: 'b' }],
      [
        { email: 'one@example.com', name: 'One' },
        { email: 'two@example.com', name: 'Two' },
      ]
    );
    expect(assigned.map((row) => [row.recipient.memberUid, row.sender.email])).toEqual([
      ['a', 'one@example.com'],
      ['b', 'two@example.com'],
      ['c', 'one@example.com'],
    ]);
  });
});

describe('batchSendDurationMs', () => {
  it('uses the fullest sender and waits between that sender’s emails', () => {
    expect(batchSendDurationMs(5, 2, 1)).toBe(120_000);
    expect(batchSendDurationMs(10, 1, 10)).toBe(54_000);
    expect(batchSendDurationMs(1, 2, 5)).toBe(0);
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
