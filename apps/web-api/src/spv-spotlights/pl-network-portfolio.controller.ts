import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { PlNetworkPortfolioService } from './pl-network-portfolio.service';

@ApiTags('Explore PL Network')
@Controller('v1/explore-pl-network')
export class PlNetworkPortfolioController {
  constructor(private readonly portfolioService: PlNetworkPortfolioService) {}

  @Get('portfolio')
  @NoCache()
  @ApiOkResponse({
    description:
      'PL Portfolio teams (excluding L0) for the Networks Map: `{ teams: [{ id, teamUid, name, logoUrl, mapLogoUrl, island, startYear, endYear, oneLiner, stage, website }] }`. `logoUrl` is the colour logo, `mapLogoUrl` the white map logo; missing values are null.',
  })
  async list() {
    return this.portfolioService.list();
  }
}
