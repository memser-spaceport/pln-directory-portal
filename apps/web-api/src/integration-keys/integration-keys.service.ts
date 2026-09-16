import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma.service';
import type {
  CreateIntegrationKeyResponse,
  IntegrationKeyListItem,
  IntegrationKeyMeResponse,
  IntegrationKeyScope,
} from 'libs/contracts/src/schema/integration-key';

/** Fixed prefix so a leaked key is recognisable in logs and by secret scanners. */
export const INTEGRATION_KEY_PREFIX = 'labos_ik_';
/** Characters of the plaintext kept for display; 7 random characters after the fixed prefix. */
export const INTEGRATION_KEY_DISPLAY_PREFIX_LENGTH = 16;
/** `lastUsedAt` is rewritten at most this often per key. */
export const INTEGRATION_KEY_LAST_USED_DEBOUNCE_MS = 60_000;

/** What `IntegrationKeyGuard` attaches to the request as `req.integrationKey`. */
export interface IntegrationKeyRequestContext {
  uid: string;
  teamUid: string;
  scopes: IntegrationKeyScope[];
  name: string;
  keyPrefix: string;
}

export function hashIntegrationKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

const listItemSelect = {
  uid: true,
  name: true,
  teamUid: true,
  keyPrefix: true,
  scopes: true,
  createdByUid: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

type ListItemRow = {
  uid: string;
  name: string;
  teamUid: string;
  keyPrefix: string;
  scopes: string[];
  createdByUid: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function toListItem(row: ListItemRow): IntegrationKeyListItem {
  return {
    uid: row.uid,
    name: row.name,
    teamUid: row.teamUid,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes as IntegrationKeyScope[],
    createdByUid: row.createdByUid,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class IntegrationKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a key for a team. The plaintext is in the response and nowhere else. */
  async issue(input: {
    teamUid: string;
    name: string;
    scopes: IntegrationKeyScope[];
    createdByUid: string | null;
  }): Promise<CreateIntegrationKeyResponse> {
    const team = await this.prisma.team.findUnique({ where: { uid: input.teamUid }, select: { uid: true } });
    if (!team) {
      throw new NotFoundException(`Team ${input.teamUid} not found`);
    }

    const key = `${INTEGRATION_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    const row = await this.prisma.integrationKey.create({
      data: {
        name: input.name,
        teamUid: input.teamUid,
        keyHash: hashIntegrationKey(key),
        keyPrefix: key.slice(0, INTEGRATION_KEY_DISPLAY_PREFIX_LENGTH),
        scopes: input.scopes,
        createdByUid: input.createdByUid,
      },
      select: listItemSelect,
    });

    return { ...toListItem(row), key };
  }

  async listForTeam(teamUid: string): Promise<IntegrationKeyListItem[]> {
    const rows = await this.prisma.integrationKey.findMany({
      where: { teamUid },
      orderBy: { createdAt: 'desc' },
      select: listItemSelect,
    });
    return rows.map(toListItem);
  }

  /** Permanent. Calling it again on a revoked key returns the row unchanged. */
  async revoke(uid: string): Promise<IntegrationKeyListItem> {
    const existing = await this.prisma.integrationKey.findUnique({ where: { uid }, select: listItemSelect });
    if (!existing) {
      throw new NotFoundException(`Integration key ${uid} not found`);
    }
    if (existing.revokedAt) {
      return toListItem(existing);
    }
    const revoked = await this.prisma.integrationKey.update({
      where: { uid },
      data: { revokedAt: new Date() },
      select: listItemSelect,
    });
    return toListItem(revoked);
  }

  /**
   * Resolves a presented plaintext key. Returns null for unknown and revoked keys
   * alike; the guard turns both into the same 401.
   */
  async authenticate(presentedKey: string): Promise<IntegrationKeyRequestContext | null> {
    const row = await this.prisma.integrationKey.findUnique({
      where: { keyHash: hashIntegrationKey(presentedKey) },
      select: {
        uid: true,
        teamUid: true,
        scopes: true,
        name: true,
        keyPrefix: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });
    if (!row || row.revokedAt) {
      return null;
    }

    const now = Date.now();
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > INTEGRATION_KEY_LAST_USED_DEBOUNCE_MS) {
      await this.prisma.integrationKey.update({ where: { uid: row.uid }, data: { lastUsedAt: new Date(now) } });
    }

    return {
      uid: row.uid,
      teamUid: row.teamUid,
      scopes: row.scopes as IntegrationKeyScope[],
      name: row.name,
      keyPrefix: row.keyPrefix,
    };
  }

  /**
   * A key acts only on its own team. Every integration route that resolves a team,
   * directly or through a job opening, calls this before reading or writing.
   */
  assertKeyOwnsTeam(key: IntegrationKeyRequestContext, teamUid: string | null | undefined): void {
    if (!teamUid || teamUid !== key.teamUid) {
      throw new ForbiddenException('Integration key is not allowed to act on this team');
    }
  }

  async describe(key: IntegrationKeyRequestContext): Promise<IntegrationKeyMeResponse> {
    const team = await this.prisma.team.findUnique({ where: { uid: key.teamUid }, select: { name: true } });
    return {
      uid: key.uid,
      keyPrefix: key.keyPrefix,
      name: key.name,
      teamUid: key.teamUid,
      teamName: team?.name ?? '',
      scopes: key.scopes,
    };
  }
}
