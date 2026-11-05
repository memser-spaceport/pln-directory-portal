import { HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT, HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT } from './ai-prompts';

describe('HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT classification', () => {
  it('treats intent modifiers as ranking intent and ranks by core signals', () => {
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('are ranking intent');
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('Industry Tags and Technologies are the core signal');
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('Focus Areas and Tags are the core signal');
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('Skills and current team names are the core signal');
  });

  it('keeps ranking rules off the continuation prompt', () => {
    expect(HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT).not.toContain('Classification and ranking');
    expect(HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT).not.toContain('are ranking intent');
    expect(HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT).not.toContain('are the core signal');
  });
});

describe('HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT web search', () => {
  it('uses searchWeb only when the directory data is thin, and labels web facts', () => {
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('Call searchWeb only when their results are not enough');
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain(
      'When the directory tools answer the question, do not call searchWeb.'
    );
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('label them clearly as web information');
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('Never present a web fact as directory data.');
  });

  it('keeps personal and access-gated data out of the web query', () => {
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain(
      "Never put the user's email, name or other personal data in it"
    );
    expect(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT).toContain('getInvestorDb, getWarmIntros or getInvestorProfiles');
  });

  it('gives the continuation prompt the same labeling rule', () => {
    expect(HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT).toContain('label the web facts clearly as web information');
  });
});
