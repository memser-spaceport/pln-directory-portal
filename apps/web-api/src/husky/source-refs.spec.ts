import { buildSourceRefs } from './source-refs';

const NEWS_TOOLS = `Team: Acme [TeamLink](/teams/acme)
Title: Acme raises Series A [NewsLink](/home?news=news-1)
Source: https://example.com/acme`;

describe('buildSourceRefs', () => {
  it('keeps the in-product news path when the answer cites the external source URL', () => {
    const { sourceRefs, mismatches } = buildSourceRefs({
      content: 'Acme raised a round [1](https://example.com/acme).',
      toolResults: NEWS_TOOLS,
      llmSources: ['https://example.com/acme'],
    });

    expect(sourceRefs).toEqual([
      {
        index: 1,
        title: 'Acme raises Series A',
        type: 'news',
        directoryLink: '/home?news=news-1',
        externalUrl: 'https://example.com/acme',
      },
    ]);
    expect(mismatches).toEqual(['citation [1](https://example.com/acme) resolved to /home?news=news-1']);
  });

  it('pairs a job page with its apply URL and leaves an unknown citation external', () => {
    const { sourceRefs } = buildSourceRefs({
      content: 'See [1](/jobs/openings/role-1) and [2](https://elsewhere.example/post).',
      toolResults: `- Senior Backend Engineer, Rust [JobLink](/jobs/openings/role-1) Apply: https://jobs.example/apply/123
Team: Example [TeamLink](/teams/team-1)`,
      llmSources: ['/jobs/openings/role-1'],
    });

    expect(sourceRefs).toEqual([
      {
        index: 1,
        title: 'Senior Backend Engineer, Rust',
        type: 'job',
        directoryLink: '/jobs/openings/role-1',
        externalUrl: 'https://jobs.example/apply/123',
      },
      {
        index: 2,
        title: 'https://elsewhere.example/post',
        type: 'external',
        externalUrl: 'https://elsewhere.example/post',
      },
    ]);
  });

  it('appends an LLM source that was never cited', () => {
    const { sourceRefs, mismatches } = buildSourceRefs({
      content: 'No citations here.',
      toolResults: '',
      llmSources: ['https://example.com/only-in-sources'],
    });

    expect(sourceRefs).toEqual([
      {
        index: 1,
        title: 'https://example.com/only-in-sources',
        type: 'external',
        externalUrl: 'https://example.com/only-in-sources',
      },
    ]);
    expect(mismatches).toEqual(['LLM source https://example.com/only-in-sources was not cited; appended as external']);
  });

  it('reads a team name from the following Name line and a member LinkedIn URL only when it is absolute', () => {
    const { sourceRefs } = buildSourceRefs({
      content: 'Acme [1](https://directory.example/teams/acme) and Ada [2](/members/ada).',
      toolResults: `[TeamLink](/teams/acme)
Name: Acme
Website: https://acme.example

[MemberLink](/members/ada)
Name: Ada Lovelace
LinkedIn: ada-lovelace

[MemberLink](/members/grace)
Name: Grace
LinkedIn: https://www.linkedin.com/in/grace`,
    });

    expect(sourceRefs).toEqual([
      {
        index: 1,
        title: 'Acme',
        type: 'team',
        directoryLink: '/teams/acme',
        externalUrl: 'https://acme.example',
      },
      {
        index: 2,
        title: 'Ada Lovelace',
        type: 'member',
        directoryLink: '/members/ada',
      },
    ]);
  });

  it('uses the forum path as the directory link and the absolute forum URL as fallback', () => {
    const { sourceRefs } = buildSourceRefs({
      content: 'Discussed in [1](https://directory.example/forum/topics/1/9).',
      toolResults: `**Topic:** Storage sync [ForumLink](/forum/topics/1/9)
**Forum Link:** https://directory.example/forum/topics/1/9`,
    });

    expect(sourceRefs).toEqual([
      {
        index: 1,
        title: 'Storage sync',
        type: 'forum',
        directoryLink: '/forum/topics/1/9',
        externalUrl: 'https://directory.example/forum/topics/1/9',
      },
    ]);
  });
});
