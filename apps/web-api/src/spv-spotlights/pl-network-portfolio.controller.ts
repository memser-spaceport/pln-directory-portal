import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlNetworkPortfolioService } from './pl-network-portfolio.service';

@ApiTags('Explore PL Network')
@Controller('v1/explore-pl-network')
export class PlNetworkPortfolioController {
  constructor(private readonly portfolioService: PlNetworkPortfolioService) {}

  @Get('portfolio')
  async list() {
    return this.portfolioService.list();
  }
}
