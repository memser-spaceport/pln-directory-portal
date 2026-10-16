import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

export const MANUAL_FIELD_SUBJECTS = ['master_profile', 'connection_edge', 'warm_path_v2'] as const;
export type ManualFieldSubject = (typeof MANUAL_FIELD_SUBJECTS)[number];

export type ManualFieldSource = 'mcp' | 'service';

export type ManualFieldActor = {
  source: ManualFieldSource;
  actorUid?: string | null;
  actorEmail?: string | null;
};

export interface PatchManualFieldsDto {
  fields?: Record<string, unknown>;
  actor?: { uid?: string | null; email?: string | null };
}

export type PatchManualFieldsResult = {
  uid: string;
  locked: string[];
  unlocked: string[];
  row: unknown;
};

type FieldKind = 'string' | 'stringList' | 'number' | 'int' | 'json' | 'datetime';

type FieldSpec = {
  kind: FieldKind;
  required?: boolean;
  maxLength?: number;
};

type ParsedField = {
  field: string;
  column: unknown;
  stored: Prisma.InputJsonValue;
};

const ACTOR_UID_MAX = 64;
const ACTOR_EMAIL_MAX = 200;

const NOT_FOUND: Record<ManualFieldSubject, string> = {
  master_profile: 'MasterProfile not found',
  connection_edge: 'ConnectionEdge not found',
  warm_path_v2: 'WarmPathV2 not found',
};

const IDENTITY_FIELDS: Record<ManualFieldSubject, ReadonlySet<string>> = {
  master_profile: new Set(['uid', 'personKey', 'createdAt', 'updatedAt']),
  connection_edge: new Set(['uid', 'fromProfileUid', 'toProfileUid', 'relationKind', 'createdAt', 'updatedAt']),
  warm_path_v2: new Set(['uid', 'targetProfileUid', 'targetSet', 'rank', 'createdAt', 'updatedAt']),
};

const FIELD_SPECS: Record<ManualFieldSubject, Record<string, FieldSpec>> = {
  master_profile: {
    types: { kind: 'stringList' },
    canonicalName: { kind: 'string', required: true },
    memberUid: { kind: 'string' },
    affinityPersonId: { kind: 'string' },
    investorOutreachId: { kind: 'string' },
    emails: { kind: 'json' },
    phones: { kind: 'json' },
    socials: { kind: 'json' },
    organizations: { kind: 'json' },
    experience: { kind: 'json' },
    education: { kind: 'json' },
    investorMeta: { kind: 'json' },
    funds: { kind: 'json' },
    investedIn: { kind: 'json' },
    coInvestments: { kind: 'json' },
    plBacking: { kind: 'json' },
    locations: { kind: 'json' },
    listMemberships: { kind: 'json' },
    raw: { kind: 'json' },
    sourceSnapshots: { kind: 'json' },
    currentOrg: { kind: 'string' },
    currentTitle: { kind: 'string' },
    bio: { kind: 'string' },
    contentHash: { kind: 'string' },
    enrichmentVersion: { kind: 'string' },
    enrichedAt: { kind: 'datetime' },
  },
  connection_edge: {
    score: { kind: 'number', required: true },
    confidence: { kind: 'number', required: true },
    method: { kind: 'string', required: true, maxLength: 16 },
    reasons: { kind: 'json', required: true },
    hintsUsed: { kind: 'json' },
    provider: { kind: 'string', maxLength: 32 },
    model: { kind: 'string', maxLength: 64 },
    promptVersion: { kind: 'string', maxLength: 64 },
    runId: { kind: 'string', maxLength: 64 },
    contentHash: { kind: 'string' },
  },
  warm_path_v2: {
    score: { kind: 'number', required: true },
    hopCount: { kind: 'int', required: true },
    hopChain: { kind: 'json', required: true },
    bestConnectorProfileUid: { kind: 'string' },
    alternateConnectorProfileUids: { kind: 'json' },
    runId: { kind: 'string', maxLength: 64 },
    computedAt: { kind: 'datetime' },
  },
};

export function serviceActor(dto: PatchManualFieldsDto | undefined): ManualFieldActor {
  return {
    source: 'service',
    actorUid: dto?.actor?.uid ?? null,
    actorEmail: dto?.actor?.email ?? null,
  };
}

/**
 * Column locks for MasterProfile, ConnectionEdge, and WarmPathV2.
 * A patch writes the live column and the lock. Ingest calls reapplyAll after it replaces a row.
 */
@Injectable()
export class ManualFieldLockService {
  constructor(private readonly prisma: PrismaService) {}

  async patch(
    subjectType: ManualFieldSubject,
    uidRaw: string,
    fields: Record<string, unknown> | undefined,
    actor: ManualFieldActor
  ): Promise<PatchManualFieldsResult> {
    const uid = typeof uidRaw === 'string' ? uidRaw.trim() : '';
    if (!uid) {
      throw new BadRequestException('uid is required');
    }
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new BadRequestException('fields object is required');
    }

    const entries = Object.entries(fields);
    if (entries.length === 0) {
      throw new BadRequestException('fields object is required');
    }

    const actorUid = optionalActor(actor.actorUid, 'actor.uid', ACTOR_UID_MAX);
    const actorEmail = optionalActor(actor.actorEmail, 'actor.email', ACTOR_EMAIL_MAX);
    const { sets, unlocks, errors } = parseFields(subjectType, entries);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'invalid fields', errors });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findRow(tx, subjectType, uid);
      if (!existing) {
        throw new NotFoundException(`${NOT_FOUND[subjectType]}: ${uid}`);
      }

      if (unlocks.length > 0) {
        const found = await tx.manualFieldLock.findMany({
          where: { subjectType, subjectUid: uid, field: { in: unlocks } },
          select: { field: true },
        });
        const have = new Set(found.map((row) => row.field));
        const missing = unlocks.filter((field) => !have.has(field));
        if (missing.length > 0) {
          throw new BadRequestException({
            message: 'invalid fields',
            errors: missing.map((field) => `${field}: no lock to clear`),
          });
        }
      }

      if (sets.length > 0) {
        await this.updateRow(
          tx,
          subjectType,
          uid,
          Object.fromEntries(sets.map((set) => [set.field, set.column]))
        );
        for (const set of sets) {
          await tx.manualFieldLock.upsert({
            where: {
              subjectType_subjectUid_field: { subjectType, subjectUid: uid, field: set.field },
            },
            create: {
              subjectType,
              subjectUid: uid,
              field: set.field,
              value: set.stored,
              source: actor.source,
              actorUid,
              actorEmail,
            },
            update: {
              value: set.stored,
              source: actor.source,
              actorUid,
              actorEmail,
            },
          });
        }
      }

      if (unlocks.length > 0) {
        await tx.manualFieldLock.deleteMany({
          where: { subjectType, subjectUid: uid, field: { in: unlocks } },
        });
      }

      const row = await this.findRow(tx, subjectType, uid);
      return {
        uid,
        locked: sets.map((set) => set.field),
        unlocked: unlocks,
        row,
      };
    });
  }

  /** Restore locks onto rows this ingest just replaced. Creates are omitted by the caller. */
  async reapplyAll(tx: Prisma.TransactionClient, subjectType: ManualFieldSubject, subjectUids: string[]): Promise<void> {
    const uids = [...new Set(subjectUids)];
    if (uids.length === 0) return;

    const locks = await tx.manualFieldLock.findMany({
      where: { subjectType, subjectUid: { in: uids } },
    });
    const byUid = new Map<string, typeof locks>();
    for (const lock of locks) {
      const rows = byUid.get(lock.subjectUid) ?? [];
      rows.push(lock);
      byUid.set(lock.subjectUid, rows);
    }

    for (const [uid, rows] of byUid) {
      const data: Record<string, unknown> = {};
      for (const lock of rows) {
        const spec = FIELD_SPECS[subjectType][lock.field];
        if (!spec) continue;
        data[lock.field] = columnValue(spec, lock.value);
      }
      if (Object.keys(data).length === 0) continue;
      await this.updateRow(tx, subjectType, uid, data);
    }
  }

  private async findRow(tx: Prisma.TransactionClient, subjectType: ManualFieldSubject, uid: string) {
    if (subjectType === 'master_profile') {
      return tx.masterProfile.findUnique({ where: { uid } });
    }
    if (subjectType === 'connection_edge') {
      return tx.connectionEdge.findUnique({ where: { uid } });
    }
    return tx.warmPathV2.findUnique({ where: { uid } });
  }

  private async updateRow(
    tx: Prisma.TransactionClient,
    subjectType: ManualFieldSubject,
    uid: string,
    data: Record<string, unknown>
  ) {
    if (subjectType === 'master_profile') {
      await tx.masterProfile.update({ where: { uid }, data: data as Prisma.MasterProfileUpdateInput });
      return;
    }
    if (subjectType === 'connection_edge') {
      await tx.connectionEdge.update({ where: { uid }, data: data as Prisma.ConnectionEdgeUpdateInput });
      return;
    }
    await tx.warmPathV2.update({ where: { uid }, data: data as Prisma.WarmPathV2UpdateInput });
  }
}

function parseFields(subjectType: ManualFieldSubject, entries: [string, unknown][]) {
  const sets: ParsedField[] = [];
  const unlocks: string[] = [];
  const errors: string[] = [];
  const specs = FIELD_SPECS[subjectType];
  const identity = IDENTITY_FIELDS[subjectType];

  for (const [field, raw] of entries) {
    if (identity.has(field)) {
      errors.push(`${field}: identity field cannot be updated`);
      continue;
    }
    const spec = specs[field];
    if (!spec) {
      errors.push(`${field}: unknown field`);
      continue;
    }
    if (raw === null) {
      unlocks.push(field);
      continue;
    }
    const parsed = parseValue(spec, field, raw);
    if ('error' in parsed) {
      errors.push(parsed.error);
      continue;
    }
    sets.push({ field, column: parsed.column, stored: parsed.stored });
  }

  return { sets, unlocks, errors };
}

function parseValue(
  spec: FieldSpec,
  field: string,
  raw: unknown
): { column: unknown; stored: Prisma.InputJsonValue } | { error: string } {
  switch (spec.kind) {
    case 'string': {
      if (typeof raw !== 'string') return { error: `${field}: must be a string` };
      const value = raw.trim();
      if (spec.required && value === '') return { error: `${field}: must be a non-empty string` };
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        return { error: `${field}: must be at most ${spec.maxLength} characters` };
      }
      return { column: value, stored: value };
    }
    case 'stringList': {
      if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
        return { error: `${field}: must be an array of strings` };
      }
      const value = raw.map((item) => item.trim());
      return { column: value, stored: value };
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: `${field}: must be a finite number` };
      return { column: raw, stored: raw };
    }
    case 'int': {
      if (typeof raw !== 'number' || !Number.isInteger(raw)) return { error: `${field}: must be an integer` };
      return { column: raw, stored: raw };
    }
    case 'json': {
      if (raw === null || typeof raw !== 'object') return { error: `${field}: must be a JSON object or array` };
      let stored: Prisma.InputJsonValue;
      try {
        stored = JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue;
      } catch {
        return { error: `${field}: must be a JSON object or array` };
      }
      if (stored === null || typeof stored !== 'object') return { error: `${field}: must be a JSON object or array` };
      return { column: stored, stored };
    }
    case 'datetime': {
      if (typeof raw !== 'string' || raw.trim() === '') return { error: `${field}: must be an ISO datetime` };
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return { error: `${field}: must be an ISO datetime` };
      return { column: date, stored: date.toISOString() };
    }
  }
}

function columnValue(spec: FieldSpec, stored: Prisma.JsonValue): unknown {
  switch (spec.kind) {
    case 'string':
      if (typeof stored !== 'string') throw new BadRequestException(`locked ${spec.kind} is invalid`);
      return stored;
    case 'stringList':
      if (!Array.isArray(stored) || stored.some((item) => typeof item !== 'string')) {
        throw new BadRequestException('locked string list is invalid');
      }
      return stored;
    case 'number':
    case 'int':
      if (typeof stored !== 'number' || !Number.isFinite(stored)) {
        throw new BadRequestException('locked number is invalid');
      }
      return stored;
    case 'datetime': {
      if (typeof stored !== 'string') throw new BadRequestException('locked datetime is invalid');
      const date = new Date(stored);
      if (Number.isNaN(date.getTime())) throw new BadRequestException('locked datetime is invalid');
      return date;
    }
    case 'json':
      if (stored === null || typeof stored !== 'object') throw new BadRequestException('locked json is invalid');
      return stored;
  }
}

function optionalActor(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${label} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new BadRequestException(`${label} must be at most ${max} characters`);
  return trimmed;
}
