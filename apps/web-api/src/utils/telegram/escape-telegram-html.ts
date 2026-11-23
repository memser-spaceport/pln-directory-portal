/** Escape text for a message sent with Telegram's `parse_mode: 'HTML'`. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
