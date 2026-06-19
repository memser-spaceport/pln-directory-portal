import { Injectable } from '@nestjs/common';
import { RoadmapSubmissionDraft } from '@prisma/client';
import { RoadmapSubmissionDraftSchema, UpsertRoadmapDraftSchema } from 'libs/contracts/src/schema/roadmap';
import { z } from 'zod';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';

type UpsertDraftBody = z.infer<typeof UpsertRoadmapDraftSchema>;
type DraftDto = z.infer<typeof RoadmapSubmissionDraftSchema>;

@Injectable()
export class RoadmapDraftsService {
  constructor(private readonly prisma: PrismaService, private readonly analytics: AnalyticsService) {}

  async getMyDraft(memberUid: string) {
    const draft = await this.prisma.roadmapSubmissionDraft.findUnique({ where: { memberUid } });
    return { draft: draft ? this.toDto(draft) : null };
  }

  async upsertMyDraft(body: UpsertDraftBody, memberUid: string) {
    // PUT semantics: the autosave sends the whole form, so omitted fields reset to
    // their empty defaults rather than being preserved from a previous save.
    const data = {
      variant: body.variant ?? 'idea',
      title: body.title ?? null,
      description: body.description ?? null,
      tags: body.tags ?? [],
      type: body.type ?? null,
      stage: body.stage ?? null,
      objectiveUid: body.objectiveUid ?? null,
      newObjectiveTitle: body.newObjectiveTitle ?? null,
      showCreateObjective: body.showCreateObjective ?? false,
    };
    const draft = await this.prisma.roadmapSubmissionDraft.upsert({
      where: { memberUid },
      create: { memberUid, ...data },
      update: data,
    });
    await this.track(ROADMAP_ANALYTICS_EVENTS.DRAFT_SAVED, memberUid, { variant: draft.variant });
    return { draft: this.toDto(draft) };
  }

  async discardMyDraft(memberUid: string) {
    // Idempotent: discarding a non-existent draft is a success, not a 404.
    const result = await this.prisma.roadmapSubmissionDraft.deleteMany({ where: { memberUid } });
    const deleted = result.count > 0;
    if (deleted) {
      await this.track(ROADMAP_ANALYTICS_EVENTS.DRAFT_DISCARDED, memberUid, {});
    }
    return { deleted };
  }

  private toDto(draft: RoadmapSubmissionDraft): DraftDto {
    return {
      uid: draft.uid,
      variant: draft.variant === 'roadmap' ? 'roadmap' : 'idea',
      title: draft.title,
      description: draft.description,
      tags: draft.tags,
      type: draft.type,
      stage: (draft.stage as DraftDto['stage']) ?? null,
      objectiveUid: draft.objectiveUid,
      newObjectiveTitle: draft.newObjectiveTitle,
      showCreateObjective: draft.showCreateObjective,
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private async track(name: string, distinctId: string, properties: Record<string, unknown>) {
    await this.analytics.trackEvent({ name, distinctId, properties });
  }
}
