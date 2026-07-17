import { isDuplicateNewsStory } from './news-dedup';

describe('isDuplicateNewsStory', () => {
  it('deduplicates the same URL despite tracking parameters and different titles', () => {
    expect(
      isDuplicateNewsStory(
        { sourceUrl: 'https://example.com/story?utm_source=x', title: 'Protocol launches v2' },
        { sourceUrl: 'https://www.example.com/story', title: 'Protocol announces second version' }
      )
    ).toBe(true);
  });

  it('deduplicates the same story reported by different sources', () => {
    expect(
      isDuplicateNewsStory(
        { sourceUrl: 'https://a.example/news', title: 'Acme raises $20 million Series A', summary: 'Acme raised $20 million to expand its network.' },
        { sourceUrl: 'https://b.example/article', title: 'Acme secures $20 million in Series A funding', summary: 'The company will use the funding to expand its network.' }
      )
    ).toBe(true);
  });

  it('keeps different stories from the same team', () => {
    expect(
      isDuplicateNewsStory(
        { sourceUrl: 'https://a.example/launch', title: 'Acme launches a new wallet' },
        { sourceUrl: 'https://b.example/funding', title: 'Acme raises a Series A round' }
      )
    ).toBe(false);
  });
});
