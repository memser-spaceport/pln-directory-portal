jest.mock('dns', () => ({
  promises: { lookup: jest.fn() },
}));

import { promises as dns } from 'dns';
import {
  decodeHtmlEntities,
  extractSocialImageUrl,
  fetchOgImageUrl,
  isAllowedOgPageUrl,
  isNonPublicAddress,
} from './og-image';

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

  // Real values seen on team news sources (LAB-2929 feature-env probe).
  it('decodes &amp; in the content attribute', () => {
    const html = `<meta property="og:image" content="https://www.iroh.computer/api/og?title=Blog&amp;subtitle=Buzz:%20share" />`;
    expect(extractSocialImageUrl(html, pageUrl)).toBe(
      'https://www.iroh.computer/api/og?title=Blog&subtitle=Buzz:%20share'
    );
  });

  it('decodes numeric character references', () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/a.jpg?w=600&#38;h=315&#x26;q=80" />`;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://cdn.example.com/a.jpg?w=600&h=315&q=80');
  });

  it('asks X/Twitter for JPEG instead of WebP', () => {
    const html = `<meta property="og:image" content="https://pbs.twimg.com/media/HSvgje3agAAhmL1?format=webp&amp;name=large" />`;
    expect(extractSocialImageUrl(html, pageUrl)).toBe(
      'https://pbs.twimg.com/media/HSvgje3agAAhmL1?format=jpg&name=large'
    );
  });

  it('leaves WebP from other hosts alone', () => {
    const html = `<meta property="og:image" content="https://media.crypto.news/2025/10/a.webp?format=webp" />`;
    expect(extractSocialImageUrl(html, pageUrl)).toBe('https://media.crypto.news/2025/10/a.webp?format=webp');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal and hex references once', () => {
    expect(decodeHtmlEntities('a&amp;b&quot;c&#39;d&#x2F;e&amp;amp;')).toBe(`a&b"c'd/e&amp;`);
  });

  it('leaves unknown or invalid references as they are', () => {
    expect(decodeHtmlEntities('&nbsp; &#0; &bogus; & plain')).toBe('&nbsp; &#0; &bogus; & plain');
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
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '0:0:0:0:0:ffff:10.0.0.1',
    '192.0.0.8',
    '192.0.2.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    'fec0::1',
    '::7f00:1',
    '::127.0.0.1',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::1',
    '2001:0:4136:e378::1',
    '2001:db8::1',
  ])('treats %s as non-public', (ip) => {
    expect(isNonPublicAddress(ip)).toBe(true);
  });

  it.each([
    '93.184.216.34',
    '8.8.8.8',
    '2606:4700:4700::1111',
    '::ffff:5db8:d822',
    '198.20.0.1',
    '2001:4860:4860::8888',
  ])('treats %s as public', (ip) => {
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
