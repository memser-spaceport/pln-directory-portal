import { BadRequestException } from '@nestjs/common';
import { RoadmapStage } from '@prisma/client';
import { IDEA_STAGES } from './roadmap.constants';

const ALLOWED_TRANSITIONS: Record<RoadmapStage, RoadmapStage[]> = {
  [RoadmapStage.IDEA]: [RoadmapStage.UNDER_REVIEW, RoadmapStage.PLANNED, RoadmapStage.DECLINED],
  [RoadmapStage.UNDER_REVIEW]: [RoadmapStage.IDEA, RoadmapStage.PLANNED, RoadmapStage.DECLINED],
  [RoadmapStage.PLANNED]: [RoadmapStage.IN_PROGRESS, RoadmapStage.DECLINED],
  [RoadmapStage.IN_PROGRESS]: [RoadmapStage.SHIPPED, RoadmapStage.PLANNED, RoadmapStage.DECLINED],
  [RoadmapStage.SHIPPED]: [RoadmapStage.IN_PROGRESS],
  [RoadmapStage.DECLINED]: [RoadmapStage.IDEA],
};

export function isIdeaStage(stage: RoadmapStage): boolean {
  return IDEA_STAGES.includes(stage);
}

export function assertTransitionAllowed(from: RoadmapStage, to: RoadmapStage): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(`Transition from ${from} to ${to} is not allowed`);
  }
}

export function isPromoteTransition(from: RoadmapStage, to: RoadmapStage): boolean {
  return isIdeaStage(from) && to === RoadmapStage.PLANNED;
}

export function isDeclineTransition(to: RoadmapStage): boolean {
  return to === RoadmapStage.DECLINED;
}
