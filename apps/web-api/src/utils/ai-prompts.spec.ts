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
