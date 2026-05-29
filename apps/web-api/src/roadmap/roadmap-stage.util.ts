import { RoadmapStage } from '@prisma/client';
import { IDEA_STAGES } from './roadmap.constants';

export function isIdeaStage(stage: RoadmapStage): boolean {
  return IDEA_STAGES.includes(stage);
}

/**
 * Stage transitions are unrestricted: a member with the transition permission may
 * move an item between any two stages (e.g. SHIPPED → PLANNED, PLANNED → IDEA).
 * Retained as a function so callers and the promote/decline side-effects stay centralized.
 */
export function assertTransitionAllowed(_from: RoadmapStage, _to: RoadmapStage): void {
  // No-op: all stage transitions are permitted for members with the transition permission.
}

export function isPromoteTransition(from: RoadmapStage, to: RoadmapStage): boolean {
  return isIdeaStage(from) && to === RoadmapStage.PLANNED;
}

export function isDeclineTransition(to: RoadmapStage): boolean {
  return to === RoadmapStage.DECLINED;
}
