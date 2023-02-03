import * as crypto from 'crypto';

export function hashFileName(filename: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(filename);
  return hash.digest('hex').substring(0, 16);
}
