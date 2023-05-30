export function maskEmail(email: string): string {
  const [username, domain] = email.split('@');
  const maskedUsername = username.slice(0, 3) + '*'.repeat(username.length - 3);
  const maskedDomain = domain.replace(/^(.{2}).+(.{2}\..+)$/, '$1****$2');
  return `${maskedUsername}@${maskedDomain}`;
}

export function maskText(text) {
  return text.replace(
    /(.{2})(.*)(.{2})/,
    (match, first, middle, last) =>
      `${first}${'*'.repeat(middle.length)}${last}`
  );
}
