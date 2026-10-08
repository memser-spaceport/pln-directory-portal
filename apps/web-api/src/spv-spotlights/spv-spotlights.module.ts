import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { InvestorsModule } from '../investors/investors.module';
import { SpvSpotlightsService } from './spv-spotlights.service';
import { SpvSpotlightAdminService } from './spv-spotlight-admin.service';
import { SpvSpotlightMailer } from './spv-spotlight-mailer';
import { PlNetworkPortfolioService } from './pl-network-portfolio.service';
import { SpvSpotlightsController } from './spv-spotlights.controller';
import { PlNetworkPortfolioController } from './pl-network-portfolio.controller';

@Module({
  imports: [SharedModule, NotificationsModule, AuthModule, InvestorsModule],
  controllers: [SpvSpotlightsController, PlNetworkPortfolioController],
  providers: [SpvSpotlightsService, SpvSpotlightAdminService, SpvSpotlightMailer, PlNetworkPortfolioService],
  exports: [SpvSpotlightsService, SpvSpotlightAdminService],
})
export class SpvSpotlightsModule {}
