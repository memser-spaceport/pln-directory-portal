import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { FeatureAgentDemoResponse, FeatureAgentDemoService } from './feature-agent-demo.service';

/**
 * Public, unauthenticated demo endpoint.
 * Exposed on the unversioned path and on the /v1 prefix used by the rest of the API.
 */
@Controller(['feature-agent-demo', 'v1/feature-agent-demo'])
export class FeatureAgentDemoController {
  constructor(private readonly featureAgentDemoService: FeatureAgentDemoService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @NoCache()
  getDemo(): FeatureAgentDemoResponse {
    return this.featureAgentDemoService.getDemo();
  }
}
