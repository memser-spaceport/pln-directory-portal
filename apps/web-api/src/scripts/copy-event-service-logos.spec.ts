jest.mock('../utils/aws/aws.service', () => ({ AwsService: class {} }));

import { copyEventServiceLogos, isEventsServiceLogoUrl, logoKey, parseArgs } from './copy-event-service-logos';

const DEV = 'https://pl-events-service.s3.us-west-1.amazonaws.com/logos/image_1.jpeg';
const PROD = 'https://pl-events-service-prod.s3.us-west-1.amazonaws.com/logos/image_2.png';

function setup(images: Array<{ uid: string; url: string; events?: number }>) {
  const prisma = {
    image: {
      findMany: jest.fn(async () =>
        images.map((image) => ({ uid: image.uid, url: image.url, _count: { eventLogo: image.events ?? 1 } }))
      ),
      update: jest.fn(async () => ({})),
    },
  };
  const store = {
    download: jest.fn(async () => ({ buffer: Buffer.from('png'), contentType: 'image/png' as string | null })),
    upload: jest.fn(async (key: string) => `https://labos-images.example/${key}`),
  };
  const lines: string[] = [];
  return { prisma, store, lines, log: (line: string) => lines.push(line) };
}

describe('copy-event-service-logos', () => {
  it('recognises only the events service buckets', () => {
    expect(isEventsServiceLogoUrl(DEV)).toBe(true);
    expect(isEventsServiceLogoUrl(PROD)).toBe(true);
    for (const other of [
      'https://images.lumacdn.com/x.png',
      'https://plabs-assets.s3.us-west-1.amazonaws.com/x.png',
      'https://pl-directory-images-dev.s3.us-west-1.amazonaws.com/x.png',
      'https://evil.example/pl-events-service.s3.us-west-1.amazonaws.com/x.png',
      'http://pl-events-service.s3.us-west-1.amazonaws.com/x.png',
      '',
      null,
    ]) {
      expect(isEventsServiceLogoUrl(other)).toBe(false);
    }
  });

  it('a dry run lists the rows and changes nothing', async () => {
    const { prisma, store, lines, log } = setup([
      { uid: 'i1', url: DEV, events: 2 },
      { uid: 'i2', url: 'https://images.lumacdn.com/x.png' },
      { uid: 'i3', url: PROD },
    ]);
    const result = await copyEventServiceLogos(prisma as any, store, { apply: false, limit: null }, log);

    expect(result).toEqual({ found: 2, copied: 0, failed: 0 });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(`would copy image=i1 events=2 ${DEV} -> ${logoKey(DEV)}`);
    expect(store.download).not.toHaveBeenCalled();
    expect(store.upload).not.toHaveBeenCalled();
    expect(prisma.image.update).not.toHaveBeenCalled();
  });

  it('with --apply it copies each logo and points the image row at the copy', async () => {
    const { prisma, store, log } = setup([{ uid: 'i1', url: DEV }]);
    const result = await copyEventServiceLogos(prisma as any, store, { apply: true, limit: null }, log);

    expect(result).toEqual({ found: 1, copied: 1, failed: 0 });
    expect(store.upload).toHaveBeenCalledWith(logoKey(DEV), expect.any(Buffer), 'image/png');
    const location = `https://labos-images.example/${logoKey(DEV)}`;
    expect(prisma.image.update).toHaveBeenCalledWith({ where: { uid: 'i1' }, data: { url: location, cid: location } });
  });

  it('a logo that cannot be copied is reported and its row is left alone', async () => {
    const { prisma, store, lines, log } = setup([
      { uid: 'i1', url: DEV },
      { uid: 'i2', url: PROD },
    ]);
    store.download.mockRejectedValueOnce(new Error('403 Forbidden'));
    const result = await copyEventServiceLogos(prisma as any, store, { apply: true, limit: null }, log);

    expect(result).toEqual({ found: 2, copied: 1, failed: 1 });
    expect(lines[0]).toContain('FAILED image=i1');
    expect(prisma.image.update).toHaveBeenCalledTimes(1);
    expect(prisma.image.update).toHaveBeenCalledWith(expect.objectContaining({ where: { uid: 'i2' } }));
  });

  it('gives a stable key with the file extension, and reads the arguments', () => {
    expect(logoKey(DEV)).toMatch(/^events\/logos\/[a-f0-9]{40}\.jpeg$/);
    expect(logoKey(DEV)).toBe(logoKey(DEV));
    expect(logoKey('https://pl-events-service.s3.us-west-1.amazonaws.com/logos/noext')).toMatch(
      /^events\/logos\/[a-f0-9]{40}$/
    );
    expect(parseArgs([])).toEqual({ apply: false, limit: null });
    expect(parseArgs(['--apply', '--limit', '20'])).toEqual({ apply: true, limit: 20 });
    expect(() => parseArgs(['--limit', '0'])).toThrow();
  });
});
