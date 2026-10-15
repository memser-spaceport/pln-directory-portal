/** Contact-support topics that are product feedback and become Linear issues. */
export const FEEDBACK_LINEAR_PLATFORM_TOPICS = ['Give feedback', 'Share an idea', 'Report a bug', 'AI Apps Feedback'];

/** The AI Apps drawer's "LabOS - AI Apps" option; its issues go into the AI Apps project. */
export const FEEDBACK_LINEAR_AI_APPS_TOPIC = 'AI Apps Feedback';

export function isFeedbackLinearPlatformTopic(topic: string): boolean {
  return FEEDBACK_LINEAR_PLATFORM_TOPICS.includes(topic);
}
