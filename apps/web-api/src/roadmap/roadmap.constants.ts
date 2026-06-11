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
  ITEM_PINNED: 'gantry_item_pinned',
  ITEM_UNPINNED: 'gantry_item_unpinned',
  PIN_NOTE_UPDATED: 'gantry_pin_note_updated',
  PINS_RELEASED: 'gantry_pins_released',
  ITEMS_REORDERED: 'gantry_items_reordered',
  OBJECTIVE_CREATED: 'gantry_objective_created',
  OBJECTIVE_SET: 'gantry_objective_set',
  PIN_LIMIT_CHANGED: 'gantry_pin_limit_changed',
} as const;

export const IDEA_STAGES: RoadmapStage[] = [RoadmapStage.IDEA, RoadmapStage.BACKLOG];

/** Stages where members can like and pin items. Everywhere else counts are frozen. */
export const PINNABLE_STAGES: RoadmapStage[] = [RoadmapStage.IDEA, RoadmapStage.PLANNED];

/** Entering any of these stages auto-returns active pins to their owners' budgets. */
export const PIN_RELEASING_STAGES: RoadmapStage[] = [
  RoadmapStage.IN_PROGRESS,
  RoadmapStage.BACKLOG,
  RoadmapStage.SHIPPED,
  RoadmapStage.DECLINED,
];

export const DEFAULT_PIN_LIMIT = 3;

/** Half-life used by the trending sort's time-decayed pin score. */
export const TRENDING_HALF_LIFE_DAYS = 14;

export const ROADMAP_KANBAN_STAGES: RoadmapStage[] = [
  RoadmapStage.PLANNED,
  RoadmapStage.IN_PROGRESS,
  RoadmapStage.SHIPPED,
];

// Relative route — the notification bell resolves links against the frontend
// origin and breaks on absolute URLs.
export function itemDetailPath(itemUid: string): string {
  return `/gantry/${itemUid}`;
}

/**
 * All user-facing roadmap notification copy lives here so a wording change is a
 * one-file swap. Each entry maps to the bell's title + description fields.
 */
// Titles lead with the status — item titles can be long or weird, so the status
// prefix keeps the bell scannable.
export const ROADMAP_NOTIFICATION_COPY = {
  newSubmission: (title: string) => ({
    title: `New need: ${title}`,
    description: 'Take a look — boost it if it matters to you.',
  }),
  boostReturned: (title: string) => ({
    title: `In Progress: ${title}`,
    description: 'Your boost budget is back — spend it on what matters next.',
  }),
  needPlanned: (title: string) => ({
    title: `Planned: ${title}`,
    description: 'Your need is on the roadmap.',
  }),
  needInProgress: (title: string) => ({
    title: `In Progress: ${title}`,
    description: 'Work on your need has started.',
  }),
  needBacklogged: (title: string) => ({
    title: `Backlog: ${title}`,
    description: 'Your need was moved to the backlog.',
  }),
  backedItemShipped: (title: string) => ({
    title: `Just Shipped: ${title} 🎉`,
    description: 'Something you boosted is now live.',
  }),
  needShipped: (title: string) => ({
    title: `Just Shipped: ${title} 🎉`,
    description: "It's live now — go try it out.",
  }),
  needDeclined: (title: string, reason: string) => ({
    title: `Declined: ${title}`,
    description: `Reason: ${reason}`,
  }),
} as const;
