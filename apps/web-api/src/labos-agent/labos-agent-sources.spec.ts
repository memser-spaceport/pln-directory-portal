import { HuskySourceRef } from 'libs/contracts/src/schema/husky-chat';
import { appOrigin, isLabosHost, pageKey, webSources } from './labos-agent-sources';

const ORIGIN = 'https://labos.example';

const NEWS: HuskySourceRef = { index: 1, title: 'Story', type: 'news', directoryLink: '/?news=n-1' };
const TEXTILE: HuskySourceRef = {
  index: 2,
  title: 'Textile',
  type: 'team',
  directoryLink: '/teams/t-1',
  externalUrl: 'https://textile.io',
};
const WEB: HuskySourceRef = { index: 3, title: 'Post', type: 'web', externalUrl: 'https://blog.example.org/post' };

describe('webSources (LAB-3362 D2)', () => {
  it('drops a source that repeats the external URL of a source ref: protocol, www and trailing slash do not count', () => {
    const sources = ['https://textile.io', 'http://www.textile.io/', 'https://blog.example.org/post/'];
    expect(webSources(sources, [TEXTILE, WEB], ORIGIN)).toEqual([]);
  });

  it('drops a source that repeats a directoryLink, resolved against the web app origin', () => {
    expect(webSources(['https://www.labos.example/?news=n-1'], [NEWS], ORIGIN)).toEqual([]);
  });

  it('drops the app itself: the configured origin and os.pl.xyz with its subdomains, also for pages that are not refs', () => {
    const sources = [
      'https://labos.example/teams/other',
      'https://directory-portal-lab-3272.os.pl.xyz/?news=n-9',
      'https://lab-3272.os.pl.xyz/members/m-1',
      'https://os.pl.xyz/',
      'https://www.os.pl.xyz/jobs',
      'https://preview-123.dev.os.pl.xyz/teams/t-1',
      'https://directory-lab-3272.os.pl.xyz/members/m-2',
      '/teams/relative',
    ];
    expect(webSources(sources, [], ORIGIN)).toEqual([]);
  });

  it('keeps real external pages once, in order, and keeps a different query as another page', () => {
    const sources = [
      'https://filecoin.io/blog/a',
      'https://news.example.com/item?id=1',
      'https://www.filecoin.io/blog/a/',
      'https://news.example.com/item?id=2',
      'https://textile.io/docs',
    ];
    expect(webSources(sources, [NEWS, TEXTILE], ORIGIN)).toEqual([
      'https://filecoin.io/blog/a',
      'https://news.example.com/item?id=1',
      'https://news.example.com/item?id=2',
      'https://textile.io/docs',
    ]);
  });

  it('matches every subdomain of os.pl.xyz, as CORS does', () => {
    for (const host of ['directory-lab-3272.os.pl.xyz', 'os.pl.xyz', 'www.os.pl.xyz', 'a.b-c.os.pl.xyz']) {
      expect(isLabosHost(`https://${host}/x`, ORIGIN)).toBe(true);
    }
    expect(webSources(['https://directory-lab-3272.os.pl.xyz/?news=n-1'], [], ORIGIN)).toEqual([]);
  });

  it('keeps other Protocol Labs sites, such as plnetwork.io, as web sources', () => {
    const sources = [
      'https://plnetwork.io/',
      'https://directory.plnetwork.io/teams/x',
      'https://www.plnetwork.io/blog/a',
    ];
    expect(webSources(sources, [], ORIGIN)).toEqual(sources);
  });

  it('drops a plnetwork.io page only when it repeats a source ref', () => {
    const ref: HuskySourceRef = { index: 1, title: 'PL', type: 'web', externalUrl: 'https://plnetwork.io/blog/a' };
    expect(webSources(['https://www.plnetwork.io/blog/a/', 'https://plnetwork.io/blog/b'], [ref], ORIGIN)).toEqual([
      'https://plnetwork.io/blog/b',
    ]);
  });

  it('keeps hosts that only look like app hosts', () => {
    const sources = ['https://os.pl.xyz.example.com/a', 'https://notos.pl.xyz/a', 'https://pl.xyz/a'];
    expect(webSources(sources, [], ORIGIN)).toEqual(sources);
  });

  it('drops values that are not http(s) URLs', () => {
    expect(webSources(['', '  ', 'mailto:a@b.c', 'javascript:alert(1)'], [], ORIGIN)).toEqual([]);
  });

  it('reads the web app origin from WEB_UI_BASE_URL, and APPLICATION_BASE_URL only when WEB_UI_BASE_URL is not set', () => {
    const before = { web: process.env.WEB_UI_BASE_URL, app: process.env.APPLICATION_BASE_URL };
    try {
      process.env.WEB_UI_BASE_URL = 'https://staging.example/';
      process.env.APPLICATION_BASE_URL = 'https://other.example';
      expect(appOrigin()).toBe('https://staging.example');
      expect(webSources(['https://staging.example/teams/x', 'https://other.example/a'], [])).toEqual([
        'https://other.example/a',
      ]);
      delete process.env.WEB_UI_BASE_URL;
      expect(appOrigin()).toBe('https://other.example');
      delete process.env.APPLICATION_BASE_URL;
      expect(appOrigin()).toBeUndefined();
    } finally {
      for (const [key, value] of [
        ['WEB_UI_BASE_URL', before.web],
        ['APPLICATION_BASE_URL', before.app],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('builds one page key: host without www, path without trailing slash, query, no fragment', () => {
    expect(pageKey('http://www.Example.com/a/?q=1#top')).toBe('example.com/a?q=1');
    expect(pageKey('/?news=n-1', ORIGIN)).toBe('labos.example?news=n-1');
    expect(isLabosHost('https://example.com', ORIGIN)).toBe(false);
  });
});
