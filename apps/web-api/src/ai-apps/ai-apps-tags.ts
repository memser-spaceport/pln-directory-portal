/**
 * Controlled tag vocabulary for AI Apps. This is the single source of truth:
 * the API serves it to the LabOS UI, the starter kit embeds it into the
 * app-metadata skill, and the deploy/metadata DTOs validate against its slugs.
 * Adding a tag is a code change + kit version bump, by design (small, stable list).
 */
export interface AiAppTag {
  slug: string;
  label: string;
  description: string;
}

export const AI_APPS_MAX_TAGS_PER_APP = 5;

export const AI_APPS_OTHER_TAG = 'other';

export const AI_APPS_TAGS: readonly AiAppTag[] = [
  {
    slug: 'dashboards',
    label: 'Dashboards & Analytics',
    description: 'Visualizes metrics, trends or data sets so people can monitor and explore them.',
  },
  {
    slug: 'knowledge',
    label: 'Knowledge & Resources',
    description: 'Collects, organizes or shares documentation, playbooks, prompts and reference material.',
  },
  {
    slug: 'network',
    label: 'Network & People',
    description: 'Helps discover, connect or map PL Network members, teams and relationships.',
  },
  {
    slug: 'planning',
    label: 'Strategy & Planning',
    description: 'Supports OKRs, roadmaps, programs and strategic planning work.',
  },
  {
    slug: 'venture',
    label: 'Venture & Portfolio',
    description: 'Deal flow, due diligence, portfolio reviews and investment decisions.',
  },
  {
    slug: 'decision-support',
    label: 'Decision Support',
    description: 'Scores, evaluates, triages or recommends to help people decide.',
  },
  {
    slug: 'ai-agents',
    label: 'AI Agents & Automation',
    description: 'Autonomous agents, chatbots and assistants that automate tasks.',
  },
  {
    slug: 'content',
    label: 'Content & Comms',
    description: 'Generates or edits written, social or video content and communications.',
  },
  {
    slug: 'developer-tools',
    label: 'Developer Tools',
    description: 'Integrations, toolkits and utilities for people building software.',
  },
  {
    slug: 'events',
    label: 'Events',
    description: 'Planning, running or following up on events and sessions.',
  },
  {
    slug: 'people-ops',
    label: 'People Ops',
    description: 'Hiring, onboarding and other people operations.',
  },
  {
    slug: AI_APPS_OTHER_TAG,
    label: 'Other',
    description: 'Does not fit any other category.',
  },
];

export const AI_APPS_TAG_SLUGS = AI_APPS_TAGS.map((tag) => tag.slug) as [string, ...string[]];
