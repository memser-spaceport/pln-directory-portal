const sendRawEmail = jest.fn();
jest.mock('aws-sdk', () => ({
  __esModule: true,
  default: { SES: jest.fn().mockImplementation(() => ({ sendRawEmail })) },
}));

import { AwsService } from './aws.service';

describe('AwsService.sendHtmlEmail', () => {
  const env = { ...process.env };
  const args = {
    from: 'directory@example.com',
    to: ['candidate@example.com'],
    subject: 'Hello',
    html: '<p>Hi</p>',
    text: 'Hi',
    replyTo: 'lead@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendRawEmail.mockReturnValue({ promise: () => Promise.resolve({ MessageId: 'm-1' }) });
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('sends nothing and returns null when email is disabled', async () => {
    process.env.IS_EMAIL_ENABLED = 'false';
    await expect(new AwsService().sendHtmlEmail(args)).resolves.toBeNull();
    expect(sendRawEmail).not.toHaveBeenCalled();
  });

  it('sends a raw message with the html, text and Reply-To', async () => {
    process.env.IS_EMAIL_ENABLED = 'true';
    await expect(new AwsService().sendHtmlEmail(args)).resolves.toEqual({ MessageId: 'm-1' });
    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    const params = sendRawEmail.mock.calls[0][0];
    expect(params.Destinations).toEqual(['candidate@example.com']);
    const raw: string = params.RawMessage.Data;
    expect(raw).toContain('From: directory@example.com');
    expect(raw).toContain('To: candidate@example.com');
    expect(raw).toContain('Reply-To: lead@example.com');
    expect(raw).toContain('Subject: Hello');
    expect(raw).toContain('<p>Hi</p>');
  });

  it('keeps the raw MIME layout of the message', async () => {
    process.env.IS_EMAIL_ENABLED = 'true';
    await new AwsService().sendHtmlEmail({
      from: 'Directory <directory@example.com>',
      to: ['candidate@example.com', 'Ünïcode Name <second@example.com>'],
      cc: ['cc@example.com'],
      subject: 'Héllo – a subject long enough to be folded across more than one header line by the composer',
      html: `<p>Hi ✓</p><p>${'a'.repeat(120)}</p>`,
      text: 'Hi ✓',
      replyTo: 'lead@example.com',
    });
    const raw: string = sendRawEmail.mock.calls[0][0].RawMessage.Data;
    const boundaries = [...raw.matchAll(/boundary="([^"]+)"/g)].map((m) => m[1]);
    let normalized = raw
      .replace(/^Message-ID: .*$/m, 'Message-ID: <MESSAGE-ID>')
      .replace(/^Date: .*$/m, 'Date: <DATE>');
    boundaries.forEach((b, i) => {
      normalized = normalized.split(b).join(`<BOUNDARY-${i}>`);
    });
    expect(normalized).toMatchSnapshot();
  });

  it('rejects when SES fails', async () => {
    process.env.IS_EMAIL_ENABLED = 'true';
    sendRawEmail.mockReturnValue({ promise: () => Promise.reject(new Error('ses down')) });
    await expect(new AwsService().sendHtmlEmail(args)).rejects.toThrow('ses down');
  });
});
