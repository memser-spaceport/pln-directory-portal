// labos-agent-drafts imports the AI SDK, which Jest cannot load. Same light mock as labos-agent-drafts.spec.ts.
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { INTRO_DRAFT_LINE } from './labos-agent-drafts';
import { lastAnswerTurn } from './labos-agent-last-answer';

/** LAB-3367 p1-p4 (Oleg, follow-up of #3780): the wordings from the review. A card waits in each case. */
describe('LAB-3367 p1-p4: lastAnswerTurn wordings', () => {
  const NORMAL = 'Lit Protocol is a key management network. It gives programmable signing.';

  it.each([
    // p1: more than one draft word after the negation.
    ['shorten your last answer, not the intro draft'],
    ["shorten your last answer, don't change the intro draft"],
    ['shorten your last answer and leave the intro draft as it is'],
    ['shorten your last answer and keep the intro card'],
    ['shorten your last answer, not the draft or the card'],
    // p1: no apostrophe, "never" and "instead of".
    ['shorten your last answer, dont change the draft'],
    ['shorten your last answer, never touch the draft'],
    ['shorten your last answer instead of the draft'],
    // p2: keep and leave at the end of the clause, or before "as", "alone" or "unchanged".
    ['shorten your last answer, keep the draft unchanged'],
    ['shorten your last answer and leave the intro alone'],
  ])('p1, p2: "%s" protects the card: no draft tool', (message) => {
    expect(lastAnswerTurn(message, true, NORMAL)).toBe('answer');
  });

  it.each([
    // p2: a real draft edit with a constraint keeps the draft path.
    ['add your last answer to it but keep the intro short'],
    ['use your last answer, but keep the draft short'],
    ['include your last answer and keep the intro friendly'],
    ['add your last answer, do not make the draft longer'],
    ["add your last answer, don't make the intro longer"],
    // p3: a content verb before "what you said / wrote", with no "to" between.
    ['add what you said about Lit to it'],
    ['include what you just said'],
    ['tell Grace what you said about Lit'],
    ['add: I enjoyed what you said at the event'],
    ['put what you wrote into the second paragraph'],
    ['mention what you said'],
    ['start with what you said about Lit'],
    // Draft path that must stay.
    ['make the draft shorter'],
    ['shorten the intro'],
    ['make it shorter'],
  ])('p2, p3: "%s" keeps the draft path', (message) => {
    expect(lastAnswerTurn(message, true, NORMAL)).toBe('model');
  });

  it.each([
    // p3: no content verb, or a "to" after the content verb, so the phrase names the previous reply.
    ['what you just said, make it shorter'],
    ['make what you said shorter'],
    ['add a line to what you said'],
    ['Shorten what you wrote.'],
    // p3: a content verb in an earlier sentence does not count.
    ['Add a line. Then shorten what you said.'],
  ])('p3: "%s" names the previous reply', (message) => {
    expect(lastAnswerTurn(message, true, NORMAL)).toBe('answer');
  });

  it.each([
    // p4: "was / got cut", "cut off" and "cut short" are not change words. "update" is not a change word.
    ['your last answer was cut off, tell me about Lit Protocol again'],
    ['your last answer was cut short. Try again'],
    ['your last answer got cut. Tell me about Lit again.'],
    ['your last answer stopped. Any update on Filecoin?'],
  ])('p4: after Stop, "%s" goes to the model with no draft tool, not the fixed answer', (message) => {
    expect(lastAnswerTurn(message, true, '')).toBe('answer');
  });

  it.each([
    ['cut your last answer in half'],
    ['shorten your last answer'],
    ['your last answer is too long'],
    ['add the team size to your last answer'],
  ])('p4: after Stop, "%s" still gets the fixed answer', (message) => {
    expect(lastAnswerTurn(message, true, '')).toBe('which');
  });

  it('the real draft line keeps the draft path', () => {
    expect(lastAnswerTurn('shorten your last answer, not the intro draft', true, INTRO_DRAFT_LINE)).toBe('model');
  });
});
