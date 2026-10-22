import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WarmIntrosV2RunStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

const WEEKLY_LOCK_MS = 12 * 60 * 60 * 1000;
const INVESTOR_LOCK_MS = 30 * 60 * 1000;

export type WarmIntrosV2RunView = {
  uid: string;
  status: WarmIntrosV2RunStatus;
  investorProfileUid: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
};

export type ClaimWarmIntrosV2RunResult =
  | { action: 'run'; uid: string }
  | { action: 'skipped'; uid: string };

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}

@Injectable()
export class WarmIntrosV2RunService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(now: Date = new Date()): Promise<ClaimWarmIntrosV2RunResult> {
    return this.claimScoped({ investorProfileUid: null, lockMs: WEEKLY_LOCK_MS, now });
  }

  async claimInvestor(investorProfileUid: string, now: Date = new Date()): Promise<ClaimWarmIntrosV2RunResult> {
    const uid = investorProfileUid.trim();
    if (!uid) throw new BadRequestException('investorProfileUid is required');
    return this.claimScoped({ investorProfileUid: uid, lockMs: INVESTOR_LOCK_MS, now });
  }

  private async claimScoped(opts: {
    investorProfileUid: string | null;
    lockMs: number;
    now: Date;
  }): Promise<ClaimWarmIntrosV2RunResult> {
    const scope = { investorProfileUid: opts.investorProfileUid };
    const active = await this.prisma.warmIntrosV2Run.findFirst({
      where: { ...scope, status: 'RUNNING', lockedUntil: { gt: opts.now } },
      orderBy: { startedAt: 'desc' },
    });
    if (active) return { action: 'skipped', uid: active.uid };

    const stale = await this.prisma.warmIntrosV2Run.findFirst({
      where: {
        ...scope,
        status: 'RUNNING',
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: opts.now } }],
      },
      orderBy: { startedAt: 'desc' },
    });
    if (stale) {
      const taken = await this.prisma.warmIntrosV2Run.updateMany({
        where: {
          uid: stale.uid,
          ...scope,
          status: 'RUNNING',
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: opts.now } }],
        },
        data: { lockedUntil: new Date(opts.now.getTime() + opts.lockMs), error: null },
      });
      if (taken.count === 1) return { action: 'run', uid: stale.uid };
      return { action: 'skipped', uid: stale.uid };
    }

    try {
      const created = await this.prisma.warmIntrosV2Run.create({
        data: {
          status: 'RUNNING',
          investorProfileUid: opts.investorProfileUid,
          lockedUntil: new Date(opts.now.getTime() + opts.lockMs),
        },
      });
      return { action: 'run', uid: created.uid };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const holder = await this.prisma.warmIntrosV2Run.findFirst({
        where: { ...scope, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
      });
      if (!holder) throw error;
      return { action: 'skipped', uid: holder.uid };
    }
  }

  async finish(uid: string, status: 'COMPLETED' | 'FAILED', error?: string | null): Promise<WarmIntrosV2RunView> {
    if (status !== 'COMPLETED' && status !== 'FAILED') {
      throw new BadRequestException('status must be COMPLETED or FAILED');
    }
    const existing = await this.prisma.warmIntrosV2Run.findUnique({ where: { uid } });
    if (!existing) throw new NotFoundException(`WarmIntrosV2Run not found: ${uid}`);
    const row = await this.prisma.warmIntrosV2Run.update({
      where: { uid },
      data: {
        status,
        finishedAt: new Date(),
        lockedUntil: null,
        error: status === 'FAILED' ? (error ?? 'failed').slice(0, 2000) : null,
      },
    });
    return toView(row);
  }

  async latest(): Promise<{ run: WarmIntrosV2RunView | null }> {
    const row = await this.prisma.warmIntrosV2Run.findFirst({
      where: { investorProfileUid: null, status: { not: 'SKIPPED' } },
      orderBy: { startedAt: 'desc' },
    });
    return { run: row ? toView(row) : null };
  }

  async latestForInvestor(investorProfileUid: string): Promise<{ run: WarmIntrosV2RunView | null }> {
    const uid = investorProfileUid.trim();
    const row = await this.prisma.warmIntrosV2Run.findFirst({
      where: { investorProfileUid: uid, status: { not: 'SKIPPED' } },
      orderBy: { startedAt: 'desc' },
    });
    return { run: row ? toView(row) : null };
  }
}

function toView(row: {
  uid: string;
  status: WarmIntrosV2RunStatus;
  investorProfileUid: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}): WarmIntrosV2RunView {
  return {
    uid: row.uid,
    status: row.status,
    investorProfileUid: row.investorProfileUid,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    error: row.error,
  };
}
