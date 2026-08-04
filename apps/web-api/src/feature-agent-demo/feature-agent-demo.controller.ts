import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { FeatureAgentDemoResponse, FeatureAgentDemoService } from './feature-agent-demo.service';

/**
 * Public, unauthenticated demo endpoint.
 * No guards are applied so the route stays reachable without a token.
 */
@Controller('feature-agent-demo')
export class FeatureAgentDemoController {
  constructor(private readonly featureAgentDemoService: FeatureAgentDemoService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @NoCache()
  getDemo(): FeatureAgentDemoResponse {
    return this.featureAgentDemoService.getDemo();
  }
}
