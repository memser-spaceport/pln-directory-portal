import { Prisma } from '@prisma/client';
import { HUSKY_BIO_DISCLAIMER } from '../utils/ai-prompts';
import { hasUnsafeMemberHtml, sanitizeMemberHtml, sanitizeMemberHtmlWriteArgs } from './member-html.util';

function params(model: string, action: Prisma.PrismaAction, args: any): Prisma.MiddlewareParams {
  return { model: model as Prisma.ModelName, action, args, dataPath: [], runInTransaction: false };
}

describe('sanitizeMemberHtml', () => {
  it('removes a script tag and its content from a bio', () => {
    expect(sanitizeMemberHtml('<p>Hello <script>alert(1)</script>world</p>')).toBe('<p>Hello world</p>');
  });

  it('removes event handlers from an AI-generated bio', () => {
    const aiBio = `<p onmouseover="steal()">Builder at <a href="https://pl.network" onclick="x()">PL</a></p><img src="https://x.io/a.png" onerror="alert(1)">${HUSKY_BIO_DISCLAIMER}`;
    const out = sanitizeMemberHtml(aiBio);
    expect(out).not.toMatch(/onmouseover|onclick|onerror|steal|alert/);
    expect(out).toContain('<a href="https://pl.network">PL</a>');
    expect(out).toContain('<img src="https://x.io/a.png" />');
  });

  it('removes javascript: URLs, also with mixed case or an encoded tab', () => {
    const out = sanitizeMemberHtml(
      '<a href="javascript:alert(1)">a</a><a href="JaVaScRiPt:alert(1)">b</a><a href="java&#x09;script:alert(1)">c</a>'
    );
    expect(out).toBe('<a>a</a><a>b</a><a>c</a>');
  });

  it('removes style, iframe and object content and unsafe inline styles', () => {
    expect(
      sanitizeMemberHtml(
        '<style>p{}</style><iframe src="https://x"></iframe><object data="x"></object><p style="background:url(javascript:alert(1))">x</p>'
      )
    ).toBe('<p>x</p>');
  });

  it('keeps the formatting the profile editor writes', () => {
    const quill =
      '<h2>About</h2><p class="ql-align-center"><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> ' +
      '<span style="color:rgb(230, 0, 0)">red</span> <a href="https://pl.network" target="_blank" rel="noopener noreferrer">link</a> ' +
      '<a href="/members/abc" class="ql-mention" data-uid="abc" data-external-id="ext" data-name="Ann" target="_blank" rel="noopener noreferrer" contenteditable="false">@Ann</a></p>' +
      '<ol><li data-list="bullet" class="ql-indent-1">one</li></ol><blockquote>q</blockquote>' +
      '<div class="ql-code-block-container"><div class="ql-code-block" data-language="plain">code</div></div>' +
      '<p><img src="https://cdn.example.com/a.png" class="ql-image-float-left" /><br /></p>';
    expect(sanitizeMemberHtml(quill)).toBe(quill);
  });

  it('keeps the AI disclaimer findable by the bulk refresh (AI_BIO_MARKERS in member-bio-refresh.util.ts)', () => {
    const out = sanitizeMemberHtml(`<p>Ann builds tools.</p>${HUSKY_BIO_DISCLAIMER}`) as string;
    expect(out).toContain('Bio is AI generated');
  });

  it('adds rel="noopener noreferrer" to links that open a new tab and drops protocol-relative URLs', () => {
    expect(sanitizeMemberHtml('<a href="https://x.io" target="_blank">a</a><a href="//evil.example">b</a>')).toBe(
      '<a href="https://x.io" target="_blank" rel="noopener noreferrer">a</a><a>b</a>'
    );
  });

  it('drops classes that are not editor classes', () => {
    expect(sanitizeMemberHtml('<p class="ql-align-right evil">x</p>')).toBe('<p class="ql-align-right">x</p>');
  });

  it('passes null and undefined through', () => {
    expect(sanitizeMemberHtml(null)).toBeNull();
    expect(sanitizeMemberHtml(undefined)).toBeUndefined();
  });
});

describe('hasUnsafeMemberHtml', () => {
  it('is true when the sanitizer removes unsafe content', () => {
    expect(hasUnsafeMemberHtml('<p>a</p><script>x</script>')).toBe(true);
    expect(hasUnsafeMemberHtml('<a href="javascript:x()">a</a>')).toBe(true);
    expect(hasUnsafeMemberHtml('<p onclick="x()">a</p>')).toBe(true);
  });

  it('is true for unsafe inline styles and script-like elements', () => {
    expect(hasUnsafeMemberHtml('<p style="background:url(javascript:alert(1))">x</p>')).toBe(true);
    expect(hasUnsafeMemberHtml('<svg><a href="x">y</a></svg>')).toBe(true);
    expect(hasUnsafeMemberHtml('<iframe src="https://x"></iframe>')).toBe(true);
  });

  it('is false for harmless formatting the editor does not write', () => {
    expect(
      hasUnsafeMemberHtml('<span style="font-size:11pt" class="MsoNormal">a</span><table><tr><td>x</td></tr></table>')
    ).toBe(false);
  });

  it('is false for safe values, also when only entities or spaces differ', () => {
    expect(hasUnsafeMemberHtml(HUSKY_BIO_DISCLAIMER)).toBe(false);
    expect(hasUnsafeMemberHtml('<p>a&nbsp;b & c</p>')).toBe(false);
    expect(hasUnsafeMemberHtml('plain text with < and >')).toBe(false);
    expect(hasUnsafeMemberHtml(null)).toBe(false);
    expect(hasUnsafeMemberHtml('')).toBe(false);
  });
});

describe('sanitizeMemberHtmlWriteArgs', () => {
  const dirty = '<p>x<script>alert(1)</script></p>';
  const clean = '<p>x</p>';

  it('sanitizes Member.bio on create and update', () => {
    const create = params('Member', 'create', { data: { name: 'Ann', bio: dirty } });
    sanitizeMemberHtmlWriteArgs(create);
    expect(create.args.data).toEqual({ name: 'Ann', bio: clean });

    const update = params('Member', 'update', { where: { uid: 'u1' }, data: { bio: { set: dirty } } });
    sanitizeMemberHtmlWriteArgs(update);
    expect(update.args.data.bio).toEqual({ set: clean });
  });

  it('sanitizes both branches of an upsert and every row of createMany and updateMany', () => {
    const upsert = params('Member', 'upsert', { where: { uid: 'u1' }, create: { bio: dirty }, update: { bio: dirty } });
    sanitizeMemberHtmlWriteArgs(upsert);
    expect(upsert.args.create.bio).toBe(clean);
    expect(upsert.args.update.bio).toBe(clean);

    const many = params('MemberExperience', 'createMany', { data: [{ description: dirty }, { description: null }] });
    sanitizeMemberHtmlWriteArgs(many);
    expect(many.args.data).toEqual([{ description: clean }, { description: null }]);

    const updateMany = params('MemberExperience', 'updateMany', { where: {}, data: { description: dirty } });
    sanitizeMemberHtmlWriteArgs(updateMany);
    expect(updateMany.args.data.description).toBe(clean);
  });

  it('sanitizes MemberExperience.description', () => {
    const create = params('MemberExperience', 'create', { data: { title: 't', description: dirty } });
    sanitizeMemberHtmlWriteArgs(create);
    expect(create.args.data.description).toBe(clean);
  });

  it('leaves other models, other fields and reads alone', () => {
    const team = params('Team', 'update', { where: { uid: 't' }, data: { longDescription: dirty } });
    sanitizeMemberHtmlWriteArgs(team);
    expect(team.args.data.longDescription).toBe(dirty);

    const otherField = params('Member', 'update', { where: { uid: 'u' }, data: { moreDetails: dirty } });
    sanitizeMemberHtmlWriteArgs(otherField);
    expect(otherField.args.data.moreDetails).toBe(dirty);

    const read = params('Member', 'findMany', { where: { bio: { contains: '<script>' } } });
    sanitizeMemberHtmlWriteArgs(read);
    expect(read.args.where.bio).toEqual({ contains: '<script>' });
  });
});
