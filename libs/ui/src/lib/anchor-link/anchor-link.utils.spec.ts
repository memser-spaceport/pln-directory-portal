import { isValidEmail, parseLink } from './anchor-link.utils';

describe('#isValidEmail', () => {
  it('should return false when passing an invalid email', () => {
    expect(isValidEmail('test@mail')).toBeFalsy();
    expect(isValidEmail('')).toBeFalsy();
    expect(isValidEmail('@mail.com')).toBeFalsy();
    expect(isValidEmail('test@.t')).toBeFalsy();
  });

  it('should return true when passing a valid email', () => {
    expect(isValidEmail('test@mail.com')).toBeTruthy();
  });
});

describe('#parseLink', () => {
  it('should return an object with isExternal set as false and a link exactly as it is when provided an internal link', () => {
    const url = '/teams';
    expect(parseLink(url)).toStrictEqual({ link: url, isExternal: false });
  });

  it('should return an object with isExternal set as false and a link exactly as it is when provided an HTML email link', () => {
    const emailLink = 'mailto:test@mail.com';
    expect(parseLink(emailLink)).toStrictEqual({
      link: emailLink,
      isExternal: false,
    });
  });

  it('should return an object with isExternal set to true and a link exactly as it is when provided an external link', () => {
    const url = 'http://test.com';
    expect(parseLink(url)).toStrictEqual({
      link: url,
      isExternal: true,
    });
  });

  it('should return an object with isExternal set to true and a fixed link when provided an invalid link', () => {
    const url = 'test.com';
    expect(parseLink(url)).toStrictEqual({
      link: 'http://test.com',
      isExternal: false,
    });
  });
});
