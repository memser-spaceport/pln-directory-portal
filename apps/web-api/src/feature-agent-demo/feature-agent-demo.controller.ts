import { Controller, Get } from '@nestjs/common';
import { FeatureAgentDemoResponseDto } from 'libs/contracts/src/schema';
import { NoCache } from '../decorators/no-cache.decorator';
import { FeatureAgentDemoService } from './feature-agent-demo.service';

@Controller('feature-agent-demo')
export class FeatureAgentDemoController {
  constructor(private readonly featureAgentDemoService: FeatureAgentDemoService) {}

  /**
   * Public, unauthenticated demo endpoint. No guards are applied on purpose.
   * `@NoCache()` keeps the returned timestamp fresh on every request.
   */
  @Get()
  @NoCache()
  getDemo(): FeatureAgentDemoResponseDto {
    return this.featureAgentDemoService.getDemo();
  }
}
