import { escapeTelegramHtml } from './escape-telegram-html';

export function telegramLink(url: string, label: string): string {
  const href = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<a href="${href}">${escapeTelegramHtml(label)}</a>`;
}
