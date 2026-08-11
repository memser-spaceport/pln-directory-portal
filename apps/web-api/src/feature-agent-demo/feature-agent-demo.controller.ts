import { Controller, Get } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import {
  FeatureAgentDemoResponse,
  FeatureAgentDemoService,
} from './feature-agent-demo.service';

/**
 * Public, unauthenticated demo endpoint used to verify autonomous coding agent
 * changes can be deployed end to end. No guards are applied by design.
 */
@Controller('feature-agent-demo')
export class FeatureAgentDemoController {
  constructor(private readonly featureAgentDemoService: FeatureAgentDemoService) {}

  @Get()
  @NoCache()
  getFeatureAgentDemo(): FeatureAgentDemoResponse {
    return this.featureAgentDemoService.getDemoInfo();
  }
}
