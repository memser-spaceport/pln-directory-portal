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
   * The environment is read from NODE_ENV and falls back to 'development'
   * when the variable is missing or empty. The timestamp is an ISO-8601 UTC string.
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
