// FEATURE-ENV ONLY — never merge (branch lab-2837-env-seed only).
/**
 * FEATURE-ENV ONLY — never merge. Lives on the unmerged branch `lab-2837-env-seed`, never on lab-2837/develop.
 *
 * A recipient allowlist in front of every SES send in this process. The feature environment's DB is a copy of
 * dev with real member emails, so with IS_EMAIL_ENABLED=true only the addresses in FEATURE_ENV_EMAIL_ALLOWLIST
 * (comma-separated, exact, case-insensitive) may ever receive mail. An empty or unset allowlist blocks every send.
 *
 * Why `makeRequest`: aws-sdk v2 defines `sendRawEmail` & co. on a per-API-version subclass prototype
 * (`AWS.SES.services['2010-12-01'].prototype`), NOT on `AWS.SES.prototype`, so patching those method names on
 * `AWS.SES.prototype` would be shadowed and do nothing. Every generated operation method is
 * `function (params, cb) { return this.makeRequest(name, params, cb) }` (and `makeUnauthenticatedRequest` calls
 * `makeRequest` too), so an own `makeRequest` on `AWS.SES.prototype` / `AWS.SESV2.prototype` sees every operation,
 * whichever method name or instance (created before or after install) it is called through.
 *
 * Operations covered (every operation of either API whose name starts with "send"):
 *   SES   sendRawEmail             filter Destinations; no/empty Destinations -> BLOCK (SES would use MIME headers)
 *   SES   sendEmail                filter Destination.{To,Cc,Bcc}Addresses
 *   SES   sendTemplatedEmail       filter Destination.{To,Cc,Bcc}Addresses
 *   SES   sendBulkTemplatedEmail   filter each Destinations[].Destination; drop entries left empty
 *   SES   sendCustomVerificationEmail  pass only if EmailAddress is allowlisted, else BLOCK
 *   SES   sendBounce               BLOCK always
 *   SESV2 sendEmail                filter Destination.{To,Cc,Bcc}Addresses; no Destination -> BLOCK
 *   SESV2 sendBulkEmail            filter each BulkEmailEntries[].Destination; drop entries left empty
 *   SESV2 sendCustomVerificationEmail  pass only if EmailAddress is allowlisted, else BLOCK
 *   any other `send*` operation    BLOCK
 * Non-send operations (quotas, templates, identities) pass through untouched.
 *
 * The allowlist is read from the environment on every call, so dotenv loading order cannot matter.
 */
import AWS from 'aws-sdk';

export const BLOCKED_MESSAGE_ID = 'feature-env-blocked';

const GUARD_MARK = '__featureEnvEmailGuard';

type Log = (line: string) => void;

type MakeRequest = (operation: string, params?: any, callback?: (err: unknown, data?: unknown) => void) => any;

type GuardTarget = { prototype: any; name: string };

type Decision =
  | { action: 'pass'; params: any; dropped: string[] }
  | { action: 'block'; reason: string; dropped: string[] };

const defaultLog: Log = (line) => console.warn(`[feature-env-email-guard] ${line}`);

/** Lower-cased addresses from FEATURE_ENV_EMAIL_ALLOWLIST; empty when unset. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** `ab***@example.com`; never the full local part. */
export function maskAddress(value: unknown): string {
  const text = String(value ?? '');
  const at = text.lastIndexOf('@');
  if (at < 0) return '***';
  const local = text.slice(0, at).replace(/^.*</, '');
  return `${local.slice(0, Math.min(2, Math.max(local.length - 1, 0)))}***${text.slice(at).replace(/>.*$/, '')}`;
}

/**
 * The bare address of `addr@x` or `Display Name <addr@x>`; null for anything else (several addresses in one
 * string, a display name containing an address or a separator), which is then treated as not allowlisted.
 */
export function bareAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const named = /^([^<>]*)<([^<>]+)>$/.exec(text);
  if (named) {
    if (/[@,;:]/.test(named[1])) return null;
    return named[2].trim().toLowerCase();
  }
  return text.toLowerCase();
}

function isAllowed(value: unknown, allowlist: Set<string>): boolean {
  const address = bareAddress(value);
  return address !== null && allowlist.has(address);
}

function filterList(list: unknown, allowlist: Set<string>, dropped: string[]): string[] {
  if (list == null) return [];
  if (!Array.isArray(list)) {
    dropped.push(String(list));
    return [];
  }
  return list.filter((entry) => {
    if (isAllowed(entry, allowlist)) return true;
    dropped.push(String(entry));
    return false;
  });
}

/** Filtered copy of a `{ ToAddresses, CcAddresses, BccAddresses }` destination; null when nothing is left. */
function filterDestination(destination: any, allowlist: Set<string>, dropped: string[]): any | null {
  if (!destination || typeof destination !== 'object') return null;
  const to = filterList(destination.ToAddresses, allowlist, dropped);
  const cc = filterList(destination.CcAddresses, allowlist, dropped);
  const bcc = filterList(destination.BccAddresses, allowlist, dropped);
  if (!to.length && !cc.length && !bcc.length) return null;
  return { ...destination, ToAddresses: to, CcAddresses: cc, BccAddresses: bcc };
}

/** What to do with one SES/SESV2 operation. Pure; exported for tests. */
export function decide(service: string, operation: string, params: any, allowlist: Set<string>): Decision {
  const dropped: string[] = [];
  if (!/^send/i.test(operation)) return { action: 'pass', params, dropped };
  if (!allowlist.size) return { action: 'block', reason: 'FEATURE_ENV_EMAIL_ALLOWLIST is empty', dropped };
  const p = params ?? {};
  const block = (reason: string): Decision => ({ action: 'block', reason, dropped });

  switch (`${service}.${operation}`) {
    case 'SES.sendRawEmail': {
      if (!Array.isArray(p.Destinations) || !p.Destinations.length) return block('raw email without Destinations');
      const kept = filterList(p.Destinations, allowlist, dropped);
      return kept.length
        ? { action: 'pass', params: { ...p, Destinations: kept }, dropped }
        : block('no allowed recipient');
    }
    case 'SES.sendEmail':
    case 'SES.sendTemplatedEmail':
    case 'SESV2.sendEmail': {
      const destination = filterDestination(p.Destination, allowlist, dropped);
      return destination
        ? { action: 'pass', params: { ...p, Destination: destination }, dropped }
        : block('no allowed recipient');
    }
    case 'SES.sendBulkTemplatedEmail':
    case 'SESV2.sendBulkEmail': {
      const key = service === 'SES' ? 'Destinations' : 'BulkEmailEntries';
      if (!Array.isArray(p[key])) return block(`bulk email without ${key}`);
      const entries = p[key].flatMap((entry: any) => {
        const destination = filterDestination(entry?.Destination, allowlist, dropped);
        return destination ? [{ ...entry, Destination: destination }] : [];
      });
      return entries.length
        ? { action: 'pass', params: { ...p, [key]: entries }, dropped }
        : block('no allowed recipient');
    }
    case 'SES.sendCustomVerificationEmail':
    case 'SESV2.sendCustomVerificationEmail':
      if (isAllowed(p.EmailAddress, allowlist)) return { action: 'pass', params: p, dropped };
      dropped.push(String(p.EmailAddress));
      return block('verification email to a non-allowlisted address');
    default:
      return block(`operation ${operation} is not allowed in a feature environment`);
  }
}

/** Stand-in for an AWS.Request: `.promise()` and `.send(cb)` resolve as if SES accepted the message. */
function blockedRequest(callback?: (err: unknown, data?: unknown) => void) {
  const data = { MessageId: BLOCKED_MESSAGE_ID };
  const request = {
    promise: () => Promise.resolve(data),
    send: (cb?: (err: unknown, data?: unknown) => void) => {
      if (cb) setImmediate(() => cb(null, data));
      return request;
    },
    on: () => request,
    abort: () => request,
  };
  if (callback) request.send(callback);
  return request;
}

/** Installs the guard on each target's prototype (idempotent). Returns an uninstall function, for tests. */
export function installFeatureEnvEmailGuard(
  targets: GuardTarget[] = [
    { prototype: AWS.SES.prototype, name: 'SES' },
    { prototype: (AWS as any).SESV2?.prototype, name: 'SESV2' },
  ],
  log: Log = defaultLog
): () => void {
  const restores: Array<() => void> = [];
  for (const { prototype, name } of targets) {
    if (!prototype || prototype[GUARD_MARK]) continue;
    const hadOwn = Object.prototype.hasOwnProperty.call(prototype, 'makeRequest');
    const ownOriginal = prototype.makeRequest;
    const original: MakeRequest = prototype.makeRequest;
    const guarded: MakeRequest = function (this: unknown, operation, params, callback) {
      const allowlist = parseAllowlist(process.env.FEATURE_ENV_EMAIL_ALLOWLIST);
      let decision: Decision;
      try {
        decision = decide(name, operation, params, allowlist);
      } catch (error) {
        decision = {
          action: 'block',
          reason: `guard error: ${error instanceof Error ? error.message : error}`,
          dropped: [],
        };
      }
      const dropped = decision.dropped.map(maskAddress).join(', ');
      if (decision.action === 'block') {
        log(`BLOCKED ${name}.${operation} (${decision.reason}); not sent to: ${dropped || '-'}`);
        return blockedRequest(typeof params === 'function' ? params : callback);
      }
      if (decision.dropped.length) log(`${name}.${operation}: dropped non-allowlisted recipient(s): ${dropped}`);
      return original.call(this, operation, decision.params, callback);
    };
    Object.defineProperty(prototype, 'makeRequest', { value: guarded, writable: true, configurable: true });
    Object.defineProperty(prototype, GUARD_MARK, { value: true, configurable: true });
    restores.push(() => {
      if (hadOwn) prototype.makeRequest = ownOriginal;
      else delete prototype.makeRequest;
      delete prototype[GUARD_MARK];
    });
  }
  const allowlist = parseAllowlist(process.env.FEATURE_ENV_EMAIL_ALLOWLIST);
  log(
    `installed on ${targets.map((t) => t.name).join(', ')}; IS_EMAIL_ENABLED=${process.env.IS_EMAIL_ENABLED ?? ''}; ` +
      `allowlist: ${allowlist.size ? [...allowlist].map(maskAddress).join(', ') : 'EMPTY (every send is blocked)'}`
  );
  return () => restores.forEach((restore) => restore());
}
