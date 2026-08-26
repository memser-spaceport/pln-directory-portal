const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseRedirectUri(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function isLoopbackUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  return LOOPBACK_HOSTS.has(parsed.hostname);
}

export function isLoopbackRedirectUri(uri: string): boolean {
  const parsed = parseRedirectUri(uri);
  return parsed ? isLoopbackUrl(parsed) && !parsed.username && !parsed.password : false;
}

export function isAllowedRedirectUri(uri: string): boolean {
  const parsed = parseRedirectUri(uri);
  if (!parsed || parsed.username || parsed.password) {
    return false;
  }
  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return false;
  }
  if (parsed.protocol === 'http:') {
    return isLoopbackUrl(parsed);
  }
  if (parsed.protocol === 'https:') {
    return Boolean(parsed.hostname);
  }
  return Boolean(parsed.hostname || parsed.pathname);
}

export function isRegisteredRedirectUri(uri: string, registered: string[]): boolean {
  if (!isAllowedRedirectUri(uri)) {
    return false;
  }
  if (registered.includes(uri)) {
    return true;
  }
  if (!isLoopbackRedirectUri(uri)) {
    return false;
  }
  return registered.some((candidate) => loopbackRedirectUrisMatch(uri, candidate));
}

function loopbackRedirectUrisMatch(left: string, right: string): boolean {
  const a = parseRedirectUri(left);
  const b = parseRedirectUri(right);
  if (!a || !b || !isLoopbackUrl(a) || !isLoopbackUrl(b)) {
    return false;
  }
  return (
    a.protocol === b.protocol &&
    a.hostname === b.hostname &&
    a.pathname === b.pathname &&
    a.search === b.search &&
    a.hash === b.hash
  );
}
