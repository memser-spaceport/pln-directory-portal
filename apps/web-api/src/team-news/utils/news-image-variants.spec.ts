import sharp from 'sharp';
import { cropTo16x9, newsImageKey, renderNewsImageVariants, toNewsImageDto } from './news-image-variants';

const makeImage = (width: number, height: number, format: 'png' | 'jpeg' = 'png') =>
  sharp({ create: { width, height, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.5 } } })
    [format]()
    .toBuffer();

describe('cropTo16x9', () => {
  it('trims the sides of a 1.91:1 og:image', () => {
    expect(cropTo16x9(1200, 630)).toEqual({ width: 1120, height: 630 });
  });

  it('trims the top and bottom of a tall image', () => {
    expect(cropTo16x9(1600, 1600)).toEqual({ width: 1600, height: 900 });
  });

  it('keeps a 16:9 image as it is', () => {
    expect(cropTo16x9(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  });
});

describe('newsImageKey', () => {
  it('stores each copy under team-news/<uid>/<width>.jpg', () => {
    expect(newsImageKey('news-1', 800)).toBe('team-news/news-1/800.jpg');
  });
});

describe('renderNewsImageVariants', () => {
  it('makes a 16:9 ORIGINAL and every smaller width as JPEG', async () => {
    const rendered = await renderNewsImageVariants(await makeImage(2400, 1260));

    expect(rendered.map((r) => [r.version, r.width, r.height])).toEqual([
      ['ORIGINAL', 2240, 1260],
      ['TINY', 400, 225],
      ['SMALL', 800, 450],
      ['MEDIUM', 1200, 675],
      ['LARGE', 1800, 1013],
    ]);
    for (const copy of rendered) {
      const meta = await sharp(copy.buffer).metadata();
      expect(meta.format).toBe('jpeg');
      expect([meta.width, meta.height]).toEqual([copy.width, copy.height]);
    }
  });

  it('skips widths that are not smaller than the source', async () => {
    const rendered = await renderNewsImageVariants(await makeImage(1200, 630, 'jpeg'));
    expect(rendered.map((r) => [r.version, r.width])).toEqual([
      ['ORIGINAL', 1120],
      ['TINY', 400],
      ['SMALL', 800],
    ]);
  });

  it('keeps only the ORIGINAL for a small source', async () => {
    const rendered = await renderNewsImageVariants(await makeImage(320, 180));
    expect(rendered.map((r) => [r.version, r.width, r.height])).toEqual([['ORIGINAL', 320, 180]]);
  });

  it('throws for bytes that are not an image', async () => {
    await expect(renderNewsImageVariants(Buffer.from('<html>not an image</html>'))).rejects.toThrow();
  });
});

describe('toNewsImageDto', () => {
  it('lists the thumbnails and the original narrowest first', () => {
    expect(
      toNewsImageDto({
        width: 1120,
        height: 630,
        url: 'https://s3/team-news/n/1120.jpg',
        thumbnails: [
          { width: 800, url: 'https://s3/team-news/n/800.jpg' },
          { width: 400, url: 'https://s3/team-news/n/400.jpg' },
        ],
      })
    ).toEqual({
      width: 1120,
      height: 630,
      variants: [
        { width: 400, url: 'https://s3/team-news/n/400.jpg' },
        { width: 800, url: 'https://s3/team-news/n/800.jpg' },
        { width: 1120, url: 'https://s3/team-news/n/1120.jpg' },
      ],
    });
  });

  it('is null when there is no copy', () => {
    expect(toNewsImageDto(null)).toBeNull();
    expect(toNewsImageDto(undefined)).toBeNull();
  });

  it('is null for a copy without a url or size', () => {
    expect(toNewsImageDto({ width: 0, height: 0, url: 'https://s3/x.jpg', thumbnails: [] })).toBeNull();
    expect(toNewsImageDto({ width: 800, height: 450, url: '', thumbnails: [] })).toBeNull();
  });
});
