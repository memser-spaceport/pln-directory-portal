import {
  clipTelegramText,
  escapeTelegramHtml,
  stripInlineDataImages,
  TELEGRAM_MESSAGE_MAX_LENGTH,
  toLinearMarkdown,
  toPlainText,
  toSupportEmailHtml,
  toSupportTelegramHtml,
} from './contact-support-html';

describe('toSupportEmailHtml', () => {
  it('escapes plain text and preserves newlines', () => {
    expect(toSupportEmailHtml('a < b\nc')).toBe('a &lt; b<br>c');
  });

  it('sanitizes HTML and keeps headings and images', () => {
    const html = toSupportEmailHtml(
      '<h2>Bug</h2><p>See <img src="https://cdn.test/shot.png" alt="shot"></p><script>alert(1)</script>'
    );
    expect(html).toContain('<h2>Bug</h2>');
    expect(html).toContain('https://cdn.test/shot.png');
    expect(html).not.toMatch(/script/i);
  });

  it('omits inline data-URI images', () => {
    const html = toSupportEmailHtml('<p>Hi</p><p><img src="data:image/png;base64,AAAA"></p>');
    expect(html).toContain('Hi');
    expect(html).toContain('[image omitted]');
    expect(html).not.toContain('data:image');
  });
});

describe('escapeTelegramHtml', () => {
  it('escapes the characters Telegram HTML mode treats as markup', () => {
    expect(escapeTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });
});

describe('toSupportTelegramHtml', () => {
  it('escapes plain text so angle brackets do not read as tags', () => {
    expect(toSupportTelegramHtml('hello <world> & co')).toBe('hello &lt;world&gt; &amp; co');
  });

  it('keeps plain-text newlines', () => {
    expect(toSupportTelegramHtml('line one\nline two')).toBe('line one\nline two');
  });

  it('turns paragraphs into separate lines and blank paragraphs into a blank line', () => {
    const text = toSupportTelegramHtml('<p>First sentence.</p><p>Second sentence.</p><p><br></p><p>Third.</p>');
    expect(text).toBe('First sentence.\nSecond sentence.\n\nThird.');
  });

  it('keeps links clickable as Telegram anchors', () => {
    const html =
      '<p>Url: <a href="https://directoryv2.dev.os.pl.xyz/jobs?dialog=reportBug" rel="noopener noreferrer" target="_blank">https://directoryv2.dev.os.pl.xyz/jobs?dialog=reportBug</a></p>' +
      '<p><br></p><p><a href="https://example.com/two" target="_blank">url2</a></p>';
    expect(toSupportTelegramHtml(html)).toBe(
      'Url: <a href="https://directoryv2.dev.os.pl.xyz/jobs?dialog=reportBug">https://directoryv2.dev.os.pl.xyz/jobs?dialog=reportBug</a>\n\n' +
        '<a href="https://example.com/two">url2</a>'
    );
  });

  it('re-escapes ampersands inside hrefs and text', () => {
    const text = toSupportTelegramHtml('<p><a href="https://x.test/?a=1&amp;b=2">A &amp; B</a></p>');
    expect(text).toBe('<a href="https://x.test/?a=1&amp;b=2">A &amp; B</a>');
  });

  it('drops anchors with unsafe hrefs but keeps their text', () => {
    expect(toSupportTelegramHtml('<p><a href="javascript:alert(1)">click</a> <a href="about:blank">me</a></p>')).toBe(
      'click me'
    );
  });

  it('maps Quill emphasis onto Telegram tags and drops unsupported tags', () => {
    const text = toSupportTelegramHtml(
      '<h2>Bug</h2><p><strong>Bold</strong> and <em>italic</em> <span class="x">plain</span> <u>u</u> <s>s</s></p>'
    );
    expect(text).toBe('Bug\n<b>Bold</b> and <i>italic</i> plain <u>u</u> <s>s</s>');
  });

  it('renders list items as bullet lines', () => {
    expect(toSupportTelegramHtml('<ul><li>one</li><li>two</li></ul>')).toBe('• one\n• two');
  });

  it('closes tags left open by malformed input and ignores stray closers', () => {
    expect(toSupportTelegramHtml('<p><b>bold</p></i>')).toBe('<b>bold</b>');
  });

  it('keeps image URLs as their own lines', () => {
    const text = toSupportTelegramHtml('<p>See this</p><p><img src="https://cdn.test/shot.png" alt="shot"></p>');
    expect(text).toBe('See this\nhttps://cdn.test/shot.png');
  });

  it('replaces data-URI images with a placeholder instead of the payload', () => {
    const text = toSupportTelegramHtml('<p>Shot</p><p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA"></p>');
    expect(text).toBe('Shot\n[image]');
  });
});

describe('stripInlineDataImages', () => {
  it('leaves plain text and hosted images alone', () => {
    expect(stripInlineDataImages('just text')).toBe('just text');
    const hosted = '<p><img src="https://cdn.test/a.png"></p>';
    expect(stripInlineDataImages(hosted)).toBe(hosted);
  });

  it('replaces data-URI images', () => {
    expect(stripInlineDataImages('<p><img src="data:image/png;base64,AAAA"></p>')).toBe('<p> [image omitted] </p>');
  });
});

describe('clipTelegramText', () => {
  it('leaves short text unchanged', () => {
    expect(clipTelegramText('hello')).toBe('hello');
  });

  it('truncates to the Telegram limit', () => {
    const text = 'x'.repeat(TELEGRAM_MESSAGE_MAX_LENGTH + 10);
    const clipped = clipTelegramText(text);
    expect(clipped.length).toBe(TELEGRAM_MESSAGE_MAX_LENGTH);
    expect(clipped.endsWith('…')).toBe(true);
  });

  it('does not cut through a tag and closes tags the cut left open', () => {
    const clipped = clipTelegramText('<b>bold</b> <a href="https://x.test/long">link text</a>', 26);
    expect(clipped).toBe('<b>bold</b> …');
    expect(clipTelegramText('<b>abcdefghij</b>', 8)).toBe('<b>abcd…</b>');
  });
});

describe('toLinearMarkdown', () => {
  it('keeps a plain-text message as is', () => {
    expect(toLinearMarkdown('  Search is slow\nsecond line ')).toEqual({
      markdown: 'Search is slow\nsecond line',
      images: [],
    });
  });

  it('converts emphasis, links, headings, lists and line breaks', () => {
    const html =
      '<h2>Title</h2><p><strong>Bold</strong> and <em>italic</em> and <s>gone</s></p>' +
      '<p>See <a href="https://x.test/a b">the page</a><br>next line</p>' +
      '<ol><li data-list="bullet">one</li><li data-list="bullet">two</li></ol><p>end</p>';
    expect(toLinearMarkdown(html).markdown).toBe(
      [
        '## Title',
        '',
        '**Bold** and _italic_ and ~~gone~~',
        '',
        'See [the page](https://x.test/a%20b)',
        'next line',
        '',
        '- one',
        '- two',
        '',
        'end',
      ].join('\n')
    );
  });

  it('keeps mailto links', () => {
    expect(toLinearMarkdown('<p><a href="mailto:a@b.co">mail</a></p>').markdown).toBe('[mail](mailto:a@b.co)');
  });

  it('drops an unsafe link but keeps its text', () => {
    const { markdown } = toLinearMarkdown('<p><a href="javascript:alert(1)">x</a></p>');
    expect(markdown).toBe('x');
    expect(markdown).not.toContain('javascript:');
  });

  it('escapes markdown control characters in text', () => {
    expect(toLinearMarkdown('<p># not *a* [link](y) `code` _x_</p>').markdown).toBe(
      '\\# not \\*a\\* \\[link\\](y) \\`code\\` \\_x\\_'
    );
  });

  it('decodes entities before escaping', () => {
    expect(toLinearMarkdown('<p>a &lt;b&gt; &amp; &quot;c&quot;</p>').markdown).toBe('a \\<b\\> & "c"');
  });

  it('encodes parentheses in a link target', () => {
    expect(toLinearMarkdown('<p><a href="https://x.test/a_(b)">w</a></p>').markdown).toBe(
      '[w](https://x.test/a_%28b%29)'
    );
  });

  it('returns images separately, with the flattened copy when present', () => {
    const html =
      '<p>look</p>' +
      '<p><img src="https://h.test/raw.png" data-flat-src="https://h.test/flat.png" data-annotations="x"></p>' +
      '<p><img src="https://h.test/two.png"></p>' +
      '<p><img src="ftp://h.test/no.png"></p>';
    const { markdown, images } = toLinearMarkdown(html);
    expect(markdown).toBe('look');
    expect(images).toEqual([
      { src: 'https://h.test/raw.png', flatSrc: 'https://h.test/flat.png' },
      { src: 'https://h.test/two.png' },
    ]);
  });

  it('ignores a non-http flattened copy', () => {
    const { images } = toLinearMarkdown('<p><img src="https://h.test/raw.png" data-flat-src="javascript:x"></p>');
    expect(images).toEqual([{ src: 'https://h.test/raw.png' }]);
  });

  it('strips scripts through the sanitizer', () => {
    expect(toLinearMarkdown('<p>hi</p><script>alert(1)</script>').markdown).toBe('hi');
  });
});

describe('toPlainText', () => {
  it('drops tags, decodes entities and keeps line structure', () => {
    expect(toPlainText('<p><strong>Search</strong> is slow</p><p>&amp; more</p>')).toBe('Search is slow\n& more');
  });

  it('returns plain text trimmed', () => {
    expect(toPlainText('  hello  ')).toBe('hello');
  });
});
