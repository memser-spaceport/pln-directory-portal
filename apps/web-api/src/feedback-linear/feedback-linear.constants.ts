/**
 * Contact-support topics that are product feedback and become Linear issues.
 * `LabOS Feedback` is the feedback drawer's LabOS option (on every page);
 * `AI Apps Feedback` is what older clients send for the same option.
 */
export const FEEDBACK_LINEAR_PLATFORM_TOPICS = [
  'Give feedback',
  'Share an idea',
  'Report a bug',
  'LabOS Feedback',
  'AI Apps Feedback',
];

/** The drawer's LabOS option as sent by older clients, from the AI Apps pages; its issues go into the AI Apps project. */
export const FEEDBACK_LINEAR_AI_APPS_TOPIC = 'AI Apps Feedback';

export function isFeedbackLinearPlatformTopic(topic: string): boolean {
  return FEEDBACK_LINEAR_PLATFORM_TOPICS.includes(topic);
}
