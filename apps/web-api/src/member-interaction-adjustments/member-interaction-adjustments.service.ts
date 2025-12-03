import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { CounterAdjustmentReason, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

type InteractionMeta = {
  uid: string;
  type: string;
  targetMemberUid?: string | null;
};

@Injectable()
export class MemberInteractionAdjustmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService
  ) {}

  /**
   * Increment scheduleMeetingCount for a SCHEDULE_MEETING inside caller's transaction.
   * No reads required if the caller already has meta.
   */
  async bumpOnScheduleMeetingTx(tx: Prisma.TransactionClient, meta: InteractionMeta): Promise<void> {
    if (meta.type !== 'SCHEDULE_MEETING' || !meta.targetMemberUid) return;
    await tx.member.update({
      where: { uid: meta.targetMemberUid },
      data: { scheduleMeetingCount: { increment: 1 } },
    });
  }

  /**
   * Universal entry-point by FOLLOW-UP uid.
   * - Resolves follow-up -> interaction (minimal shape) using the SAME client (tx)
   * - Applies idempotent adjustment per (interactionUid, reason)
   * - Decrements scheduleMeetingCount clamped to 0 — all inside the SAME tx
   */
  async applyAdjustmentForFollowUpTx(
    tx: Prisma.TransactionClient,
    params: { followUpUid: string; reason: CounterAdjustmentReason; createdByUid?: string | null }
  ): Promise<void> {
    const fup = await tx.memberFollowUp.findUnique({
      where: { uid: params.followUpUid },
      select: {
        interaction: { select: { uid: true, type: true, targetMemberUid: true } },
      },
    });
    if (!fup || !fup.interaction) throw new NotFoundException('Follow-up or related interaction not found');

    await this.applyAdjustmentByInteractionTx(tx, {
      interactionUid: fup.interaction.uid,
      reason: params.reason,
      createdByUid: params.createdByUid ?? null,
    });
  }

  /**
   * Universal entry-point by INTERACTION uid.
   * - Loads minimal meta
   * - Applies idempotent adjustment per (interactionUid, reason)
   * - Decrements scheduleMeetingCount clamped to 0 — all inside the SAME tx
   */
  async applyAdjustmentByInteractionTx(
    tx: Prisma.TransactionClient,
    params: { interactionUid: string; reason: CounterAdjustmentReason; createdByUid?: string | null }
  ): Promise<void> {
    const ix = await tx.memberInteraction.findUnique({
      where: { uid: params.interactionUid },
      select: { uid: true, type: true, targetMemberUid: true },
    });
    if (!ix) throw new NotFoundException('Interaction not found');
    if (ix.type !== 'SCHEDULE_MEETING' || !ix.targetMemberUid) return;

    // Idempotent audit row (unique on interactionUid+reason)
    try {
      await tx.memberInteractionAdjustment.create({
        data: {
          uid: randomUUID(),
          interactionUid: ix.uid,
          reason: params.reason,
          createdBy: params.createdByUid ?? null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') return; // already applied -> no-op
      throw e;
    }

    // Decrement with clamp to 0 (Prisma has no GREATEST)
    await tx.$executeRawUnsafe(
      `
        UPDATE "Member"
        SET "scheduleMeetingCount" =
              CASE
                WHEN "scheduleMeetingCount" > 0 THEN "scheduleMeetingCount" - 1
                ELSE 0
              END
        WHERE "uid" = $1
      `,
      ix.targetMemberUid
    );
  }
}
