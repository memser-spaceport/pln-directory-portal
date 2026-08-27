import sanitizeHtml from 'sanitize-html';
import { DESCRIPTION_HTML_MAX_CHARS, sanitizeJobDescriptionHtml } from './job-description-html.util';

jest.mock('sanitize-html', () => jest.fn((html: string) => html));

const mockedSanitizeHtml = sanitizeHtml as jest.MockedFunction<typeof sanitizeHtml>;

describe('sanitizeJobDescriptionHtml', () => {
  beforeEach(() => {
    mockedSanitizeHtml.mockClear();
    mockedSanitizeHtml.mockImplementation((html: string) => html);
  });

  it('returns null for empty, whitespace, or non-string input', () => {
    expect(sanitizeJobDescriptionHtml(undefined)).toBeNull();
    expect(sanitizeJobDescriptionHtml(null)).toBeNull();
    expect(sanitizeJobDescriptionHtml('')).toBeNull();
    expect(sanitizeJobDescriptionHtml('   ')).toBeNull();
  });

  it('passes HTML through sanitize-html with the job-description allowlist', () => {
    mockedSanitizeHtml.mockReturnValue('<p>Hello</p>');
    expect(sanitizeJobDescriptionHtml('<p>Hello</p><script>x</script>')).toBe('<p>Hello</p>');
    expect(mockedSanitizeHtml).toHaveBeenCalledWith(
      '<p>Hello</p><script>x</script>',
      expect.objectContaining({
        allowedTags: expect.arrayContaining(['p', 'ul', 'a', 'h1']),
        allowedAttributes: { a: ['href'] },
      })
    );
  });

  it('returns null when sanitizer strips everything', () => {
    mockedSanitizeHtml.mockReturnValue('  ');
    expect(sanitizeJobDescriptionHtml('<script>alert(1)</script>')).toBeNull();
  });

  it(`truncates input to ${DESCRIPTION_HTML_MAX_CHARS} characters before sanitizing`, () => {
    const long = `<p>${'x'.repeat(DESCRIPTION_HTML_MAX_CHARS + 50)}</p>`;
    mockedSanitizeHtml.mockImplementation((html: string) => html);
    sanitizeJobDescriptionHtml(long);
    expect(mockedSanitizeHtml.mock.calls[0][0].length).toBe(DESCRIPTION_HTML_MAX_CHARS);
  });
});
