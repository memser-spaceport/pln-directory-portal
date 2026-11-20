import { TEXT_PART_BREAK, textPartBreak } from './text-parts.util';

describe('textPartBreak (LAB-3362 D3)', () => {
  it('puts a blank line between two parts that have no break', () => {
    expect(textPartBreak('I will check your changes.', 'Got your profile.')).toBe(TEXT_PART_BREAK);
    expect(TEXT_PART_BREAK).toBe('\n\n');
  });

  it('counts the line breaks that the parts already have', () => {
    expect(textPartBreak('Done.\n', 'Next')).toBe('\n');
    expect(textPartBreak('Done.', '\nNext')).toBe('\n');
    expect(textPartBreak('Done.\n\n', 'Next')).toBe('');
    expect(textPartBreak('Done.', '\n\nNext')).toBe('');
    expect(textPartBreak('Done. ', ' Next')).toBe('\n\n');
  });

  it('adds nothing at the start of the answer or for an empty part', () => {
    expect(textPartBreak('', 'Next')).toBe('');
    expect(textPartBreak(' \n', 'Next')).toBe('');
    expect(textPartBreak('Done.', '')).toBe('');
  });
});
