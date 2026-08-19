export function isLoopbackRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function isRegisteredRedirectUri(uri: string, registered: string[]): boolean {
  return registered.includes(uri) && isLoopbackRedirectUri(uri);
}
