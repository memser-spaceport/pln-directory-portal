import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { PlNetworkPortfolioController } from './pl-network-portfolio.controller';
import { PlNetworkPortfolioService } from './pl-network-portfolio.service';

@Module({
  imports: [SharedModule],
  controllers: [PlNetworkPortfolioController],
  providers: [PlNetworkPortfolioService],
  exports: [PlNetworkPortfolioService],
})
export class PlNetworkPortfolioModule {}
