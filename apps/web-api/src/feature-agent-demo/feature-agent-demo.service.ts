import { Injectable } from '@nestjs/common';

export interface FeatureAgentDemoResponse {
  message: string;
  environment: string;
  feature: string;
  timestamp: string;
}

export const FEATURE_AGENT_DEMO_MESSAGE = 'Hello from autonomous coding agent';
export const FEATURE_AGENT_DEMO_FEATURE = 'agent-demo';
export const FEATURE_AGENT_DEMO_DEFAULT_ENVIRONMENT = 'development';

@Injectable()
export class FeatureAgentDemoService {
  /**
   * Builds the public demo payload.
   * The environment is resolved on every call so that it always reflects
   * the current process configuration, and the timestamp is the current
   * time in ISO-8601 UTC format (e.g. 2026-08-03T12:34:56.789Z).
   */
  getDemo(): FeatureAgentDemoResponse {
    return {
      message: FEATURE_AGENT_DEMO_MESSAGE,
      environment: process.env.NODE_ENV || FEATURE_AGENT_DEMO_DEFAULT_ENVIRONMENT,
      feature: FEATURE_AGENT_DEMO_FEATURE,
      timestamp: new Date().toISOString(),
    };
  }
}
