import { presentEmailForViewer } from './inactive-email';

describe('presentEmailForViewer', () => {
  const marked = { uid: 'm1', email: 'dead@example.com', hasInactiveEmail: true };

  it('nulls the email of a marked member for other viewers', () => {
    expect(presentEmailForViewer(marked, false)).toEqual({ ...marked, email: null });
  });

  it('keeps the email for the member themselves or a directory admin', () => {
    expect(presentEmailForViewer(marked, true)).toEqual(marked);
  });

  it('leaves unmarked members untouched', () => {
    const member = { uid: 'm2', email: 'live@example.com', hasInactiveEmail: false };
    expect(presentEmailForViewer(member, false)).toEqual(member);
  });
});
