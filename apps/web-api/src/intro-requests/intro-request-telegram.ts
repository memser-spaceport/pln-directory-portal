import { Injectable } from '@nestjs/common';
import axios from 'axios';

const REDACTED = '[redacted]';

export function redactAsksBotToken(value: string): string {
  const token = process.env.TELEGRAM_ASKS_BOT_TOKEN;
  if (!token) {
    return value;
  }
  return value.split(token).join(REDACTED);
}

function failureMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const description = typeof error.response?.data?.description === 'string' ? error.response.data.description : '';
    const detail = description ? `: ${description}` : '';
    return redactAsksBotToken(`Telegram send failed${status ? ` (${status})` : ''}${detail}`);
  }
  if (error instanceof Error) {
    return redactAsksBotToken(error.message);
  }
  return 'Telegram send failed';
}

@Injectable()
export class IntroRequestTelegram {
  async send(text: string): Promise<string> {
    const token = process.env.TELEGRAM_ASKS_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ASKS_CHAT_ID;
    if (!token || !chatId) {
      throw new Error('TELEGRAM_ASKS_BOT_TOKEN or TELEGRAM_ASKS_CHAT_ID is not set');
    }

    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        },
        { timeout: 15000 }
      );
      const messageId = response.data?.result?.message_id;
      if (messageId == null) {
        throw new Error('Telegram sendMessage returned no message id');
      }
      return String(messageId);
    } catch (error) {
      throw new Error(failureMessage(error));
    }
  }
}
