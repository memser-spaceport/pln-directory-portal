import crypto from 'crypto';

export const getRandomId = () => {
  return crypto.randomUUID({ disableEntropyCache: true });
};
