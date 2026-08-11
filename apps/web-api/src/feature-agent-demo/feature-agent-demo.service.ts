import { Injectable } from '@nestjs/common';

export interface FeatureAgentDemoResponse {
  message: string;
  environment: string;
  feature: string;
  timestamp: string;
}

@Injectable()
export class FeatureAgentDemoService {
  getDemoInfo(): FeatureAgentDemoResponse {
    return {
      message: 'Hello from autonomous coding agent v2',
      environment: process.env.NODE_ENV || 'development',
      feature: 'agent-demo',
      timestamp: new Date().toISOString(),
    };
  }
}
