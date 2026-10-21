jest.mock('dns', () => ({
  promises: { lookup: jest.fn() },
}));

import { promises as dns } from 'dns';
import { extractSocialImageUrl, fetchOgImageUrl, isAllowedOgPageUrl, isNonPublicAddress } from './og-image';

const lookupMock = dns.lookup as unknown as jest.Mock;

describe('extractSocialImageUrl', () => {
  const pageUrl = 'https://www.plrd.org/talks/jbp-allison-duettmann';

  it('prefers og:image over twitter:image', () => {
    const html = `
      <html><head>
        <meta property="og:image" content="/images/og.png" />
        <meta name="twitter:image" content="https://cdn.example.com/tw.jpg" />
      </head></html>
    `;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://www.plrd.org/images/og.png');
  });

  it('falls back to twitter:image', () => {
    const html = `
      <meta name="twitter:image" content="https://cdn.example.com/tw.jpg" />
    `;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://cdn.example.com/tw.jpg');
  });

  it('handles content attribute before property', () => {
    const html = `<meta content="https://cdn.example.com/a.jpg" property="og:image" />`;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://cdn.example.com/a.jpg');
  });

  it('returns null when no social image meta is present', () => {
    expect(extractSocialImageUrl('<html></html>', pageUrl)).toBeNull();
  });
});

describe('isAllowedOgPageUrl', () => {
  it.each(['https://news.example.com/a', 'https://sub.example.co.uk/path?q=1'])('accepts %s', (url) => {
    expect(isAllowedOgPageUrl(url)).toBe(true);
  });

  it.each([
    'http://news.example.com/a',
    'ftp://news.example.com/a',
    'https://localhost/a',
    'https://localhost./a',
    'https://news.example.com:8443/a',
    'https://api.localhost/a',
    'http://localhost/a',
    'https://127.0.0.1/a',
    'http://127.0.0.1/a',
    'https://10.0.0.5/a',
    'https://[::1]/a',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
    '',
  ])('refuses %s', (url) => {
    expect(isAllowedOgPageUrl(url)).toBe(false);
  });
});

const fakeHeaders = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('treats %s as non-public', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('treats %s as public', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(false);
  });
});

describe('fetchOgImageUrl', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  const htmlResponse = (html: string, init: { url?: string; contentType?: string; status?: number } = {}) => ({
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    url: init.url ?? '',
    headers: fakeHeaders({ 'content-type': init.contentType ?? 'text/html; charset=utf-8' }),
    text: jest.fn().mockResolvedValue(html),
  });

  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the absolute https og:image of the page', async () => {
    fetchMock.mockResolvedValue(htmlResponse('<meta property="og:image" content="/img/og.png" />'));
    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBe('https://news.example.com/img/og.png');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://news.example.com/a',
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({ 'User-Agent': 'PLDirectory/1.0' }),
      })
    );
  });

  it.each(['http://127.0.0.1/a', 'http://localhost/a', 'https://localhost/a', 'http://news.example.com/a'])(
    'makes no request for %s',
    async (url) => {
      await expect(fetchOgImageUrl(url)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('makes no request when the host name resolves to a private address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.7', family: 4 }]);
    await expect(fetchOgImageUrl('https://internal.example.com/a')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops a slow DNS lookup at the 5 s deadline and makes no request', async () => {
    jest.useFakeTimers();
    try {
      lookupMock.mockReturnValue(new Promise(() => undefined)); // never resolves
      const result = fetchOgImageUrl('https://slow-dns.example.com/a');
      jest.advanceTimersByTime(5000);
      await expect(result).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('makes no request when the host name does not resolve', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(fetchOgImageUrl('https://missing.example.com/a')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads at most 200 000 characters of a streamed body', async () => {
    const encoder = new TextEncoder();
    const chunk = encoder.encode(
      '<meta property="og:image" content="https://cdn.example.com/a.jpg" />' + 'x'.repeat(150_000)
    );
    let reads = 0;
    const cancel = jest.fn().mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ...htmlResponse(''),
      body: {
        getReader: () => ({
          read: jest.fn(async () => {
            reads++;
            return { done: false, value: chunk };
          }),
          cancel,
        }),
      },
    });

    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBe('https://cdn.example.com/a.jpg');
    expect(reads).toBe(2);
    expect(cancel).toHaveBeenCalled();
  });

  it('returns null when the image is not https', async () => {
    fetchMock.mockResolvedValue(htmlResponse('<meta property="og:image" content="http://cdn.example.com/a.jpg" />'));
    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBeNull();
  });

  it('returns null for a non-HTML response', async () => {
    fetchMock.mockResolvedValue(htmlResponse('%PDF', { contentType: 'application/pdf' }));
    await expect(fetchOgImageUrl('https://news.example.com/a.pdf')).resolves.toBeNull();
  });

  it('returns null when the page has no image', async () => {
    fetchMock.mockResolvedValue(htmlResponse('<html><head></head></html>'));
    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBeNull();
  });

  it('returns null when the request fails or times out', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBeNull();
  });

  it('follows an https redirect', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 301,
        url: '',
        headers: fakeHeaders({ location: '/moved' }),
        text: jest.fn(),
      })
      .mockResolvedValueOnce(htmlResponse('<meta property="og:image" content="https://cdn.example.com/a.jpg" />'));
    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBe('https://cdn.example.com/a.jpg');
    expect(fetchMock).toHaveBeenLastCalledWith('https://news.example.com/moved', expect.anything());
  });

  it('does not follow a redirect to a refused host', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 302,
      url: '',
      headers: fakeHeaders({ location: 'http://127.0.0.1/internal' }),
      text: jest.fn(),
    });
    await expect(fetchOgImageUrl('https://news.example.com/a')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
