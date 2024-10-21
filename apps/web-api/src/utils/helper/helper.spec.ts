import { getRandomId, generateOAuth2State, generateProfileURL, isEmails, slugify } from './helper';

describe('Utility Functions', () => {
  describe('getRandomId', () => {
    it('should return a valid UUID', () => {
      const randomId = getRandomId();
      expect(randomId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('generateOAuth2State', () => {
    it('should return a string of length 21', () => {
      const state = generateOAuth2State();
      expect(state).toHaveLength(21);
    });

    it('should only contain alphanumeric characters', () => {
      const state = generateOAuth2State();
      expect(state).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('generateProfileURL', () => {
    it('should return the correct profile URL for uid type', () => {
      process.env.WEB_UI_BASE_URL = 'http://localhost:3000';
      const url = generateProfileURL('12345', 'uid');
      expect(url).toBe('http://localhost:3000/members/12345');
    });

    it('should return the correct profile URL for without uid type', () => {
      process.env.WEB_UI_BASE_URL = 'http://localhost:3000';
      const url = generateProfileURL('12345');
      expect(url).toBe('http://localhost:3000/members/12345');
    });

    it('should return undefined for unsupported types', () => {
      const url = generateProfileURL('12345', 'unsupported');
      expect(url).toBeUndefined();
    });
  });

  describe('isEmails', () => {
    it('should return true for valid emails', () => {
      const emails = ['test@example.com', 'user@domain.com'];
      const result = isEmails(emails);
      expect(result).toBe(true);
    });

    it('should return false for invalid emails', () => {
      const emails = ['invalid-email', 'user@domain.com'];
      const result = isEmails(emails);
      expect(result).toBe(false);
    });

    it('should return false for an empty array', () => {
      const result = isEmails([]);
      expect(result).toBe(true);
    });
  });

  describe('slugify', () => {
    it('should convert string to a slug', () => {
      const result = slugify('Hello World!');
      expect(result).toBe('hello-world');
    });

    it('should handle multiple spaces and special characters', () => {
      const result = slugify('This is   a test!!!');
      expect(result).toBe('this-is-a-test');
    });

    it('should handle leading and trailing spaces', () => {
      const result = slugify('   Leading and trailing spaces   ');
      expect(result).toBe('leading-and-trailing-spaces');
    });
  });
});
