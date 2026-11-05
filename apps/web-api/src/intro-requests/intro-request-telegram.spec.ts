jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: (value: { isAxiosError?: boolean } | null) => Boolean(value && value.isAxiosError === true),
  },
}));

import axios from 'axios';
import { IntroRequestTelegram } from './intro-request-telegram';

describe('IntroRequestTelegram', () => {
  const token = 'super-secret-token';
  const post = jest.spyOn(axios, 'post');

  beforeEach(() => {
    process.env.TELEGRAM_ASKS_BOT_TOKEN = token;
    process.env.TELEGRAM_ASKS_CHAT_ID = '-100555';
    post.mockReset();
  });

  afterAll(() => {
    post.mockRestore();
  });

  it('posts with the asks bot and returns the message id', async () => {
    post.mockResolvedValue({ data: { result: { message_id: 42 } } });

    await expect(new IntroRequestTelegram().send('hello')).resolves.toBe('42');

    expect(post).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: '-100555', text: 'hello', parse_mode: 'HTML' },
      { timeout: 15000 }
    );
  });

  it('does not include the bot token in a failed send error', async () => {
    post.mockRejectedValue({
      isAxiosError: true,
      message: `timeout ${token} https://api.telegram.org/bot${token}/sendMessage`,
      config: { url: `https://api.telegram.org/bot${token}/sendMessage` },
      response: { status: 500, data: { description: `bad ${token}` } },
    });

    try {
      await new IntroRequestTelegram().send('hello');
      throw new Error('expected the send to fail');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe('Telegram send failed (500): bad [redacted]');
      expect(message).not.toContain(token);
    }
  });
});
