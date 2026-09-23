import { BadRequestException } from '@nestjs/common';
import {
  AI_APPS_MAX_PUBLIC_PATHS,
  assertValidPublicPaths,
  matchesPublicPath,
  normalizeRequestPath,
  publicPathPatternError,
} from './ai-apps-public-paths';

function invalidPatternsOf(input: string[]) {
  try {
    assertValidPublicPaths(input);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as { message: string; invalidPatterns: { pattern: string }[] };
  }
  throw new Error('expected validation to fail');
}

describe('public path patterns', () => {
  describe('validation', () => {
    it('accepts valid patterns and keeps their order', () => {
      expect(assertValidPublicPaths(['/api/*', '/webhooks/stripe'])).toEqual(['/api/*', '/webhooks/stripe']);
    });

    it('trims patterns and collapses duplicates', () => {
      expect(assertValidPublicPaths([' /api/* ', '/api/*', '/b'])).toEqual(['/api/*', '/b']);
    });

    it.each(['/', '/*', '*', '/**', '/*/health', ''])('rejects the whole-app pattern %p', (pattern) => {
      expect(publicPathPatternError(pattern)).not.toBeNull();
    });

    it.each(['api/*', '/api//x', '/api/../x', '/api/./x', '/api?x=1', '/api#x', '/a b', '/a%20b', '/a\\b'])(
      'rejects the malformed pattern %p',
      (pattern) => {
        expect(publicPathPatternError(pattern)).not.toBeNull();
      }
    );

    it('rejects patterns longer than 200 characters', () => {
      expect(publicPathPatternError(`/${'a'.repeat(200)}`)).not.toBeNull();
      expect(publicPathPatternError(`/${'a'.repeat(199)}`)).toBeNull();
    });

    it('names every invalid pattern in the 400 body', () => {
      const body = invalidPatternsOf(['/api/*', '/*', 'nope']);
      expect(body.invalidPatterns.map((row) => row.pattern)).toEqual(['/*', 'nope']);
      expect(body.message).toContain('"/*" the first path segment must be literal');
      expect(body.message).toContain('"nope" must start with /');
    });

    it('rejects more than 20 distinct patterns', () => {
      const patterns = Array.from({ length: AI_APPS_MAX_PUBLIC_PATHS + 1 }, (_, index) => `/p${index}`);
      expect(invalidPatternsOf(patterns).message).toContain(`${AI_APPS_MAX_PUBLIC_PATHS}`);
      expect(assertValidPublicPaths(patterns.slice(0, AI_APPS_MAX_PUBLIC_PATHS))).toHaveLength(
        AI_APPS_MAX_PUBLIC_PATHS
      );
    });
  });

  describe('matching', () => {
    it('lets * span segments', () => {
      for (const path of ['/api/', '/api/users', '/api/v1/users/42']) {
        expect(matchesPublicPath(['/api/*'], path)).toBe(true);
      }
      expect(matchesPublicPath(['/api/*'], '/api')).toBe(false);
      expect(matchesPublicPath(['/api/*'], '/apix')).toBe(false);
    });

    it('matches exact patterns exactly', () => {
      expect(matchesPublicPath(['/webhooks/stripe'], '/webhooks/stripe')).toBe(true);
      expect(matchesPublicPath(['/webhooks/stripe'], '/webhooks/stripe/')).toBe(false);
      expect(matchesPublicPath(['/webhooks/stripe'], '/webhooks/stripe/x')).toBe(false);
    });

    it('is case-sensitive and treats regex characters literally', () => {
      expect(matchesPublicPath(['/api/*'], '/API/x')).toBe(false);
      expect(matchesPublicPath(['/v1.0/x'], '/v1x0/x')).toBe(false);
      expect(matchesPublicPath(['/v1.0/x'], '/v1.0/x')).toBe(true);
    });

    it('ignores the query string and fragment', () => {
      expect(matchesPublicPath(['/api/*'], '/api/items?token=x')).toBe(true);
      expect(matchesPublicPath(['/webhooks/stripe'], '/webhooks/stripe?x=1#y')).toBe(true);
    });

    it('collapses repeated slashes before matching', () => {
      expect(matchesPublicPath(['/api/*'], '//api//items')).toBe(true);
    });

    it('decodes the path once before matching', () => {
      expect(matchesPublicPath(['/api/*'], '/%61pi/items')).toBe(true);
    });

    it.each([
      '/api/../admin',
      '/api/%2e%2e/admin',
      '/api/%2E%2E/admin',
      '/api/./x',
      '/api/%5cadmin',
      '/api/a\\b',
      '/api/%00',
      '/api/%zz',
      '/api/%252e%252e/admin',
    ])('never matches the suspicious path %p', (path) => {
      expect(matchesPublicPath(['/api/*'], path)).toBe(false);
    });

    it('never matches without patterns or a usable path', () => {
      expect(matchesPublicPath([], '/api/x')).toBe(false);
      expect(matchesPublicPath(null, '/api/x')).toBe(false);
      expect(matchesPublicPath(['/api/*'], undefined)).toBe(false);
      expect(matchesPublicPath(['/api/*'], 'api/x')).toBe(false);
    });

    it('ignores a stored pattern that would open the whole app', () => {
      expect(matchesPublicPath(['/*'], '/anything')).toBe(false);
    });
  });

  describe('normalizeRequestPath', () => {
    it('returns the decoded, collapsed path', () => {
      expect(normalizeRequestPath('/a//b%20c?q=1')).toBe('/a/b c');
    });
  });
});
