import { telegramLink } from './telegram-link';

describe('telegramLink', () => {
  it('escapes the href and the label', () => {
    expect(telegramLink('https://x.test/?a=1&b="2"', 'A <b>')).toBe(
      '<a href="https://x.test/?a=1&amp;b=&quot;2&quot;">A &lt;b&gt;</a>'
    );
  });
});
