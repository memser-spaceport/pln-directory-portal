import { getSiteUrl } from './sitemap.utils';

describe('#getSiteUrl', () => {
  const PREVIEW_URL = 'preview-url.com';

  it('should return the production URL when environment is production', () => {
    expect(getSiteUrl('production')).toEqual('https://www.plnetwork.io');
  });

  it('should return the preview URL when environment is not production and the preview URL is defined', () => {
    expect(getSiteUrl(null, PREVIEW_URL)).toEqual(`https://${PREVIEW_URL}`);
  });

  it('should return the localhost URL when environment is not production and the preview URL is not defined', () => {
    expect(getSiteUrl(null, null)).toEqual('http://localhost:4200');
  });
});
