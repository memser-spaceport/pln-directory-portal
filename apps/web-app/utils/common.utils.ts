

export function cookiePrefix() {
  const environment = process.env.ENVIRONMENT || 'development';
  return environment + '_';
};