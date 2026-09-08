import { normalizeExternalLinkedinUrl } from './job-openings-linkedin-url';

describe('normalizeExternalLinkedinUrl', () => {
  it('leaves a full https URL untouched', () => {
    expect(normalizeExternalLinkedinUrl('https://www.linkedin.com/in/johndoe')).toBe(
      'https://www.linkedin.com/in/johndoe'
    );
  });

  it('leaves a full http URL untouched', () => {
    expect(normalizeExternalLinkedinUrl('http://linkedin.com/in/johndoe')).toBe('http://linkedin.com/in/johndoe');
  });

  it('builds a profile URL from a bare handle', () => {
    expect(normalizeExternalLinkedinUrl('johndoe')).toBe('https://www.linkedin.com/in/johndoe');
  });

  it('builds a profile URL from a scheme-less domain, without doubling the in/ segment', () => {
    expect(normalizeExternalLinkedinUrl('linkedin.com/in/johndoe')).toBe('https://www.linkedin.com/in/johndoe');
    expect(normalizeExternalLinkedinUrl('www.linkedin.com/in/johndoe')).toBe('https://www.linkedin.com/in/johndoe');
  });

  it('trims whitespace and stray slashes', () => {
    expect(normalizeExternalLinkedinUrl('  johndoe/  ')).toBe('https://www.linkedin.com/in/johndoe');
  });
});
