import {
  LabosAgentAnswerCounts,
  LabosAgentAnswerCountsSchema,
  LabosAgentChatResponseSchema,
} from 'libs/contracts/src/schema/labos-agent';
import { answerCounts, WEB_SEARCH_TOOL } from './labos-agent-answer-counts';

const NEWS_REF = { index: 1, title: 'Team X raises a seed round', type: 'news' as const, directoryLink: '/?news=n1' };
const WEB_REF = { index: 2, title: 'About', type: 'web' as const, externalUrl: 'https://saturngrid.example/about' };

/** A finished C1 body, as the stream writes it, with the counts of `turn`. */
function body(counts: Partial<LabosAgentAnswerCounts>) {
  return {
    steps: ['Understanding your question', 'Writing the answer'],
    content: 'Answer',
    followUpQuestions: [],
    sources: ['https://saturngrid.example/about'],
    actions: [],
    sourceRefs: [WEB_REF],
    proposals: [],
    drafts: [],
    ...counts,
  };
}

describe('answerCounts (LAB-3297, V0-R4)', () => {
  it('gives 0 tools, no web search and 0 sources for a turn with no tool call', () => {
    expect(answerCounts({ toolNames: [], sources: [], sourceRefs: [] })).toEqual({
      toolCount: 0,
      usedWebSearch: false,
      sourceCount: 0,
    });
  });

  it('counts each tool call, also two calls of one tool, with no web search', () => {
    const counts = answerCounts({
      toolNames: ['list_news', 'get_news_item', 'get_news_item'],
      sources: [],
      sourceRefs: [NEWS_REF],
    });
    expect(counts).toEqual({ toolCount: 3, usedWebSearch: false, sourceCount: 1 });
  });

  it('sets usedWebSearch and counts the web sources when the web search ran', () => {
    const counts = answerCounts({
      toolNames: ['list_news', WEB_SEARCH_TOOL],
      sources: ['https://other.example/page'],
      sourceRefs: [NEWS_REF, WEB_REF],
    });
    expect(counts).toEqual({ toolCount: 2, usedWebSearch: true, sourceCount: 3 });
  });

  it('counts a source once when it is in both lists or twice in one list', () => {
    const counts = answerCounts({
      toolNames: [WEB_SEARCH_TOOL],
      sources: ['https://saturngrid.example/about/', ' https://saturngrid.example/about', '', 'https://b.example'],
      sourceRefs: [WEB_REF, { ...WEB_REF, index: 3 }, NEWS_REF, { ...NEWS_REF, index: 4 }],
    });
    expect(counts.sourceCount).toBe(3);
  });

  it('counts a ref with no link by its type and title', () => {
    const ref = { index: 1, title: 'A team', type: 'team' as const };
    expect(answerCounts({ toolNames: [], sources: [], sourceRefs: [ref, { ...ref, index: 2 }] }).sourceCount).toBe(1);
  });

  it('gives counts and a boolean only, no text', () => {
    const counts = answerCounts({ toolNames: [WEB_SEARCH_TOOL], sources: ['https://a.example'], sourceRefs: [] });
    expect(Object.keys(counts).sort()).toEqual(['sourceCount', 'toolCount', 'usedWebSearch']);
    expect(typeof counts.toolCount).toBe('number');
    expect(typeof counts.usedWebSearch).toBe('boolean');
    expect(typeof counts.sourceCount).toBe('number');
  });
});

describe('C1 final body schema (LAB-3297)', () => {
  it('parses a body with the counts', () => {
    const counts = answerCounts({ toolNames: [WEB_SEARCH_TOOL], sources: body({}).sources, sourceRefs: [WEB_REF] });
    const parsed = LabosAgentChatResponseSchema.parse(body(counts));
    expect(parsed).toEqual(expect.objectContaining({ toolCount: 1, usedWebSearch: true, sourceCount: 1 }));
    // Other keys pass through.
    expect((parsed as Record<string, unknown>).proposals).toEqual([]);
  });

  it('parses a body with no counts, as an older backend sends it', () => {
    const parsed = LabosAgentChatResponseSchema.parse(body({}));
    expect(parsed.toolCount).toBeUndefined();
    expect(parsed.usedWebSearch).toBeUndefined();
    expect(parsed.sourceCount).toBeUndefined();
  });

  it('rejects counts that are not counts', () => {
    expect(LabosAgentAnswerCountsSchema.safeParse({ toolCount: -1 }).success).toBe(false);
    expect(LabosAgentAnswerCountsSchema.safeParse({ sourceCount: 1.5 }).success).toBe(false);
    expect(LabosAgentAnswerCountsSchema.safeParse({ usedWebSearch: 'yes' }).success).toBe(false);
    expect(LabosAgentAnswerCountsSchema.safeParse({ toolCount: '2' }).success).toBe(false);
  });
});
