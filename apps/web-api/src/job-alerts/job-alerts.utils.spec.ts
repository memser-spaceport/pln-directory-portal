import {
  canonicalizeFilterState,
  hashFilterState,
  generateAutoName,
  seniorityLabel,
} from './job-alerts.utils';

describe('canonicalizeFilterState', () => {
  it('trims whitespace, dedupes, sorts arrays', () => {
    const out = canonicalizeFilterState({
      q: '  ml  ',
      roleCategory: ['Engineering', 'Engineering', '  Design  '],
      seniority: [],
      focus: ['Web3'],
      location: [],
      workMode: ['remote', 'distributed', 'remote'],
    } as any);
    expect(out.q).toBe('ml');
    expect(out.roleCategory).toEqual(['Design', 'Engineering']);
    expect(out.workMode).toEqual(['distributed', 'remote']);
    expect(out.focus).toEqual(['Web3']);
  });

  it('drops empty strings and falsy q', () => {
    const out = canonicalizeFilterState({
      q: '   ',
      roleCategory: ['', '   ', 'Design'],
      seniority: [],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    expect(out.q).toBeUndefined();
    expect(out.roleCategory).toEqual(['Design']);
  });
});

describe('hashFilterState', () => {
  it('is deterministic and order-independent for arrays', () => {
    const a = canonicalizeFilterState({
      roleCategory: ['Design', 'Engineering'],
      seniority: ['Senior (L4)'],
      focus: [],
      location: [],
      workMode: ['remote', 'distributed'],
    } as any);
    const b = canonicalizeFilterState({
      roleCategory: ['Engineering', 'Design'],
      seniority: ['Senior (L4)'],
      focus: [],
      location: [],
      workMode: ['distributed', 'remote'],
    } as any);
    expect(hashFilterState(a)).toBe(hashFilterState(b));
  });

  it('case-insensitive on q', () => {
    const a = canonicalizeFilterState({
      q: 'Rust',
      roleCategory: [],
      seniority: [],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    const b = canonicalizeFilterState({
      q: 'RUST',
      roleCategory: [],
      seniority: [],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    expect(hashFilterState(a)).toBe(hashFilterState(b));
  });

  it('differs when filters differ', () => {
    const a = canonicalizeFilterState({
      roleCategory: ['Design'],
      seniority: [],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    const b = canonicalizeFilterState({
      roleCategory: ['Design', 'Product'],
      seniority: [],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    expect(hashFilterState(a)).not.toBe(hashFilterState(b));
  });
});

describe('generateAutoName', () => {
  it('joins major filters and shows seniority display label', () => {
    const name = generateAutoName({
      roleCategory: ['Design'],
      seniority: ['Mid (L3)'],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    expect(name).toBe('Design · Mid');
  });

  it('falls back to "Job alert" when nothing is selected', () => {
    const name = generateAutoName({
      roleCategory: [],
      seniority: [],
      focus: [],
      location: [],
      workMode: [],
    } as any);
    expect(name).toBe('Job alert');
  });

  it('truncates long names with ellipsis', () => {
    const name = generateAutoName(
      {
        roleCategory: ['A very long role category name that should be truncated'],
        seniority: [],
        focus: [],
        location: [],
        workMode: [],
      } as any,
      20,
    );
    expect(name.length).toBeLessThanOrEqual(20);
    expect(name.endsWith('…')).toBe(true);
  });
});

describe('seniorityLabel', () => {
  it('strips the (L#) suffix', () => {
    expect(seniorityLabel('Mid (L3)')).toBe('Mid');
    expect(seniorityLabel('Junior (L1-L2)')).toBe('Junior');
    expect(seniorityLabel('Senior (L4)')).toBe('Senior');
  });

  it('returns raw when no mapping', () => {
    expect(seniorityLabel('Other')).toBe('Other');
  });
});
