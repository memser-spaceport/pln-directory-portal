import { RoadmapStage } from '@prisma/client';

export const ROADMAP_ANALYTICS_EVENTS = {
  IDEA_CREATED: 'gantry_idea_created',
  IDEA_UPDATED: 'gantry_idea_updated',
  IDEA_ARCHIVED: 'gantry_idea_archived',
  ITEM_UPVOTED: 'gantry_item_upvoted',
  UPVOTE_REMOVED: 'gantry_item_upvote_removed',
  IDEA_PROMOTED: 'gantry_idea_promoted',
  IDEA_DECLINED: 'gantry_idea_declined',
  ROADMAP_STATUS_CHANGED: 'gantry_roadmap_status_changed',
  BUILD_BUTTON_CLICKED: 'gantry_build_button_clicked',
} as const;

export const IDEA_STAGES: RoadmapStage[] = [RoadmapStage.IDEA, RoadmapStage.BACKLOG];

export const ROADMAP_KANBAN_STAGES: RoadmapStage[] = [
  RoadmapStage.PLANNED,
  RoadmapStage.IN_PROGRESS,
  RoadmapStage.SHIPPED,
];

export function itemDetailPath(itemUid: string): string {
  const base = process.env.WEB_UI_BASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}/roadmap/items/${itemUid}`;
}
