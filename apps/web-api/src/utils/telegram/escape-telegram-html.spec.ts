import { escapeTelegramHtml } from './escape-telegram-html';

describe('escapeTelegramHtml', () => {
  it('escapes the characters Telegram HTML mode treats as markup', () => {
    expect(escapeTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });
});
