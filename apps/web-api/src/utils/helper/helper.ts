import crypto from 'crypto';

export const getRandomId = () => {
  return crypto.randomUUID({ disableEntropyCache: true });
};

export const generateOAuth2State = () => {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
};

export const generateProfileURL = (value, type='uid') => {
  let profileURL;
  if (type === 'uid') {
    profileURL = `${process.env.WEB_UI_BASE_URL}/members/${value}`
  }
  return profileURL;
}

export const isEmails = (emails: string[]) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let isValid = true;
  for (const email of emails) {
    if (!re.test(email)) {
      isValid = false;
    }
  }
  return isValid;
}