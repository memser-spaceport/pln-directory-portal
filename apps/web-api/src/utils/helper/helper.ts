import crypto from 'crypto';

export const getRandomId = () => {
  return crypto.randomUUID({ disableEntropyCache: true });
};

export const generateOAuth2State = () => {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
};