import axios from 'axios';
import { FEEDBACK_IMAGE_MAX_BYTES, isAllowedImageUrl, LinearImageUploader } from './linear-images';

// A factory keeps Jest from loading axios's ESM build.
jest.mock('axios', () => ({ create: jest.fn() }));

const HOSTS = ['images.test'];

describe('isAllowedImageUrl', () => {
  it.each([
    ['https://images.test/a.png', true],
    ['https://IMAGES.test/a.png', true],
    ['http://images.test/a.png', false],
    ['https://images.test:8443/a.png', false],
    ['https://user:pw@images.test/a.png', false],
    ['https://evil.test/a.png', false],
    ['https://images.test.evil.test/a.png', false],
    ['https://169.254.169.254/latest', false],
    ['not a url', false],
  ])('%s → %s', (url, allowed) => {
    expect(isAllowedImageUrl(url, HOSTS)).toBe(allowed);
  });
});

describe('LinearImageUploader', () => {
  const get = jest.fn();
  const put = jest.fn();
  let linear: { fileUpload: jest.Mock };
  let uploader: LinearImageUploader;

  function imageResponse(bytes = 4, contentType = 'image/png') {
    return { data: new Uint8Array(bytes).buffer, headers: { 'content-type': contentType } };
  }

  beforeEach(() => {
    get.mockReset();
    put.mockReset().mockResolvedValue({ status: 200 });
    (axios.create as jest.Mock).mockReturnValue({ get, put });
    linear = {
      fileUpload: jest.fn().mockResolvedValue({
        uploadUrl: 'https://upload.linear.test/put',
        assetUrl: 'https://uploads.linear.app/asset.png',
        headers: [{ key: 'x-goog-meta', value: 'm' }],
      }),
    };
    uploader = new LinearImageUploader(linear as never);
  });

  it('copies an allowed image into Linear and embeds the asset', async () => {
    get.mockResolvedValue(imageResponse(4));

    const lines = await uploader.rehost([{ src: 'https://images.test/dir/shot.png' }], HOSTS);

    expect(lines).toEqual(['![Screenshot 1](https://uploads.linear.app/asset.png)']);
    expect(get.mock.calls[0][1]).toMatchObject({
      responseType: 'arraybuffer',
      timeout: 10_000,
      maxContentLength: FEEDBACK_IMAGE_MAX_BYTES,
      maxRedirects: 0,
    });
    expect(linear.fileUpload).toHaveBeenCalledWith('image/png', 'shot.png', 4);
    expect(put.mock.calls[0][0]).toBe('https://upload.linear.test/put');
    expect(put.mock.calls[0][2].headers).toMatchObject({ 'Content-Type': 'image/png', 'x-goog-meta': 'm' });
  });

  it('prefers the flattened copy over the raw screenshot', async () => {
    get.mockResolvedValue(imageResponse());
    await uploader.rehost([{ src: 'https://images.test/raw.png', flatSrc: 'https://images.test/flat.png' }], HOSTS);
    expect(get.mock.calls[0][0]).toBe('https://images.test/flat.png');
  });

  it('never fetches a disallowed host and links it instead', async () => {
    const lines = await uploader.rehost(
      [{ src: 'https://169.254.169.254/x.png' }, { src: 'http://images.test/plain-http.png' }],
      HOSTS
    );
    expect(get).not.toHaveBeenCalled();
    expect(linear.fileUpload).not.toHaveBeenCalled();
    expect(lines).toEqual([
      '[Screenshot 1](https://169.254.169.254/x.png)',
      '[Screenshot 2](http://images.test/plain-http.png)',
    ]);
  });

  it.each([
    ['a download error (too large or timed out)', () => get.mockRejectedValue(new Error('maxContentLength exceeded'))],
    ['a non-image response', () => get.mockResolvedValue(imageResponse(4, 'text/html'))],
    ['a body over 10 MB', () => get.mockResolvedValue(imageResponse(FEEDBACK_IMAGE_MAX_BYTES + 1))],
    [
      'a failed upload URL request',
      () => {
        get.mockResolvedValue(imageResponse());
        linear.fileUpload.mockRejectedValue(new Error('linear down'));
      },
    ],
    [
      'a failed PUT',
      () => {
        get.mockResolvedValue(imageResponse());
        put.mockRejectedValue(new Error('403'));
      },
    ],
  ])('falls back to a link on %s', async (_, arrange) => {
    arrange();
    const lines = await uploader.rehost([{ src: 'https://images.test/a.png' }], HOSTS);
    expect(lines).toEqual(['[Screenshot 1](https://images.test/a.png)']);
  });

  it('keeps going after one image fails', async () => {
    get.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(imageResponse());
    const lines = await uploader.rehost(
      [{ src: 'https://images.test/a.png' }, { src: 'https://images.test/b.png' }],
      HOSTS
    );
    expect(lines).toEqual([
      '[Screenshot 1](https://images.test/a.png)',
      '![Screenshot 2](https://uploads.linear.app/asset.png)',
    ]);
  });

  it('uses a default filename when the URL has none', async () => {
    get.mockResolvedValue(imageResponse());
    await uploader.rehost([{ src: 'https://images.test/' }], HOSTS);
    expect(linear.fileUpload).toHaveBeenCalledWith('image/png', 'screenshot-1.png', 4);
  });
});
