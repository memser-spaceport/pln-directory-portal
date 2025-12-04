export function removeToken() {
  document.cookie = 'plnadmin=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie.match(/(?:^|;\s*)plnadmin=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
