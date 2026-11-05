import { BadRequestException } from '@nestjs/common';
import { promises as dns } from 'dns';
import {
  decodeImageData,
  FORUM_IMAGE_DATA_MAX_BYTES,
  FORUM_IMAGE_URL_MAX_BYTES,
  forumImageTools,
  sniffImageType,
} from './mcp-forum-image-tools';
import { z } from 'zod';
import { McpActorContext, toolInputSchema } from './mcp-tools';

jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }));
const lookup = dns.lookup as unknown as jest.Mock;

const request = jest.fn();
global.fetch = request as unknown as typeof fetch;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 2)]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(16, 3)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'latin1'),
  Buffer.alloc(8),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

const CTX = { memberUid: 'member-1', authorizationUid: 'auth-1' } as McpActorContext;

/** What fetch resolves to, as far as the tool reads it (Jest here has no global Response). */
function answer(status: number, body: Buffer = Buffer.alloc(0), headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    body: null,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

function build() {
  const images = {
    upload: jest.fn().mockResolvedValue({ image: { url: 'https://img.labos.example/abc.png' } }),
  };
  const [tool] = forumImageTools(images as any);
  return { images, tool };
}

describe('forum images (LAB-3156)', () => {
  beforeEach(() => {
    request.mockReset();
    lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('knows the four image types by their bytes, and nothing else', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(GIF)).toBe('image/gif');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('stores base64 data the way the forum editor does and returns Markdown for the post', async () => {
    const { images, tool } = build();

    const result = await tool.execute(CTX, { data: PNG.toString('base64'), alt: 'Team photo' });

    expect(images.upload).toHaveBeenCalledTimes(1);
    const file = images.upload.mock.calls[0][0];
    expect(file).toMatchObject({ mimetype: 'image/png', originalname: 'forum-image.png', size: PNG.length });
    expect(Buffer.compare(file.buffer, PNG)).toBe(0);
    expect(request).not.toHaveBeenCalled();
    expect(result).toEqual({
      uploaded: {
        url: 'https://img.labos.example/abc.png',
        markdown: '![Team photo](https://img.labos.example/abc.png)',
        mimeType: 'image/png',
        size: PNG.length,
      },
    });
  });

  it('accepts a data: URL and takes the type from the bytes, not from the label', async () => {
    const { images, tool } = build();

    await tool.execute(CTX, { data: `data:image/png;base64,${JPEG.toString('base64')}` });

    expect(images.upload.mock.calls[0][0]).toMatchObject({ mimetype: 'image/jpeg', originalname: 'forum-image.jpg' });
  });

  it('keeps alt text from breaking out of the Markdown image', async () => {
    const { tool } = build();

    const result = (await tool.execute(CTX, { data: GIF.toString('base64'), alt: 'a ](javascript:x) [b\nc' })) as any;

    expect(result.uploaded.markdown).toBe('![a (javascript:x) b c](https://img.labos.example/abc.png)');
  });

  it('refuses what is not a JPEG, PNG, WebP or GIF without storing it', async () => {
    const { images, tool } = build();

    await expect(tool.execute(CTX, { data: SVG.toString('base64') })).rejects.toThrow(
      'Only JPEG, PNG, WebP or GIF images can be uploaded.'
    );
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('refuses broken base64 and data over 2 MB', () => {
    expect(() => decodeImageData('not base64!')).toThrow(BadRequestException);
    expect(() => decodeImageData('')).toThrow(BadRequestException);
    const big = Buffer.alloc(FORUM_IMAGE_DATA_MAX_BYTES + 3, 0).toString('base64');
    expect(() => decodeImageData(big)).toThrow('The image is larger than 2 MB.');
  });

  it('wants exactly one of imageUrl and data', async () => {
    const { images, tool } = build();

    await expect(tool.execute(CTX, {})).rejects.toThrow('Give imageUrl or data (exactly one of them).');
    await expect(
      tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png', data: PNG.toString('base64') })
    ).rejects.toThrow('Give imageUrl or data (exactly one of them).');
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('keeps both inputs through the MCP schema', () => {
    const { tool } = build();
    // As the MCP SDK parses tool args before execute (a raw shape becomes z.object)
    const shape = toolInputSchema(tool);
    const schema = shape instanceof z.ZodType ? shape : z.object(shape as Record<string, z.ZodTypeAny>);
    const parsed = schema.parse({ imageUrl: ' https://cdn.example.com/a.png ', alt: 'x' });
    expect(parsed).toEqual({ imageUrl: 'https://cdn.example.com/a.png', alt: 'x' });
  });

  describe('imageUrl', () => {
    it('downloads a public https image and stores LabOS its own copy', async () => {
      const { images, tool } = build();
      request.mockResolvedValue(answer(200, PNG, { 'content-type': 'image/png' }));

      const result = (await tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png' })) as any;

      expect(lookup).toHaveBeenCalledWith('cdn.example.com', { all: true });
      expect(request).toHaveBeenCalledWith(
        'https://cdn.example.com/a.png',
        expect.objectContaining({ method: 'GET', redirect: 'manual' })
      );
      expect(images.upload.mock.calls[0][0]).toMatchObject({ mimetype: 'image/png', size: PNG.length });
      expect(result.uploaded.url).toBe('https://img.labos.example/abc.png');
    });

    it('refuses http, IP literals, ports and localhost without fetching', async () => {
      const { tool } = build();
      for (const imageUrl of [
        'http://cdn.example.com/a.png',
        'https://127.0.0.1/a.png',
        'https://cdn.example.com:8443/a.png',
        'https://localhost/a.png',
        'file:///etc/passwd',
      ]) {
        await expect(tool.execute(CTX, { imageUrl })).rejects.toThrow('imageUrl must be a public https URL');
      }
      expect(request).not.toHaveBeenCalled();
    });

    it('refuses a host that resolves to an internal address', async () => {
      const { tool } = build();
      lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

      await expect(tool.execute(CTX, { imageUrl: 'https://internal.example.com/a.png' })).rejects.toThrow(
        'imageUrl must be a public https URL'
      );
      expect(request).not.toHaveBeenCalled();
    });

    it('checks every redirect hop the same way', async () => {
      const { tool } = build();
      request.mockResolvedValueOnce(answer(302, undefined, { location: 'https://internal.example.com/a.png' }));
      lookup
        .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
        .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);

      await expect(tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png' })).rejects.toThrow(
        'imageUrl must be a public https URL'
      );
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('refuses an image over 5 MB, by its header or by what it sends', async () => {
      const { images, tool } = build();
      request.mockResolvedValueOnce(answer(200, PNG, { 'content-length': String(FORUM_IMAGE_URL_MAX_BYTES + 1) }));
      await expect(tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png' })).rejects.toThrow(
        'The image is larger than 5 MB.'
      );

      request.mockResolvedValueOnce(answer(200, Buffer.concat([PNG, Buffer.alloc(FORUM_IMAGE_URL_MAX_BYTES)])));
      await expect(tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png' })).rejects.toThrow(
        'The image is larger than 5 MB.'
      );
      expect(images.upload).not.toHaveBeenCalled();
    });

    it('says what the URL answered when it is not an image or not there', async () => {
      const { tool } = build();
      request.mockResolvedValueOnce(answer(404));
      await expect(tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png' })).rejects.toThrow(
        'The image URL answered 404.'
      );

      request.mockResolvedValueOnce(answer(200, Buffer.from('<html></html>'), { 'content-type': 'text/html' }));
      await expect(tool.execute(CTX, { imageUrl: 'https://cdn.example.com/page' })).rejects.toThrow(
        'Only JPEG, PNG, WebP or GIF images can be uploaded.'
      );

      request.mockRejectedValueOnce(new Error('ECONNRESET'));
      await expect(tool.execute(CTX, { imageUrl: 'https://cdn.example.com/a.png' })).rejects.toThrow(
        'The image could not be downloaded from that URL.'
      );
    });
  });
});
