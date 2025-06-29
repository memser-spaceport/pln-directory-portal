import { Controller, Get } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { RecommendationsService } from './recommendations.service';

@Controller('v1/recommendations')
@NoCache()
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get('settings/roles')
  @NoCache()
  async getUniqueRoles() {
    return this.recommendationsService.getUniqueRoles();
  }
}
