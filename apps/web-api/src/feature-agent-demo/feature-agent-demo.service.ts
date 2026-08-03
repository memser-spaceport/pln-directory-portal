import { Injectable } from '@nestjs/common';
import { FeatureAgentDemoResponseDto } from 'libs/contracts/src/schema';
import { APP_ENV } from '../utils/constants';
import { FEATURE_AGENT_DEMO_FEATURE, FEATURE_AGENT_DEMO_MESSAGE } from './feature-agent-demo.constants';

@Injectable()
export class FeatureAgentDemoService {
  /**
   * Builds the static demo payload, stamped with the current UTC time.
   * The environment falls back to `development` when `NODE_ENV` is not set.
   */
  getDemo(): FeatureAgentDemoResponseDto {
    return {
      message: FEATURE_AGENT_DEMO_MESSAGE,
      environment: process.env.NODE_ENV || APP_ENV.DEV,
      feature: FEATURE_AGENT_DEMO_FEATURE,
      timestamp: new Date().toISOString(),
    };
  }
}
