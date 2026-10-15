import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';
import { InvestorsModule } from '../investors/investors.module';
import { SpvSpotlightsService } from './spv-spotlights.service';
import { SpvSpotlightAdminService } from './spv-spotlight-admin.service';
import { SpvSpotlightMailer } from './spv-spotlight-mailer';
import { PlNetworkPortfolioModule } from './pl-network-portfolio.module';
import { SpvSpotlightsController } from './spv-spotlights.controller';

@Module({
  imports: [SharedModule, NotificationsModule, AuthModule, InvestorsModule, PlNetworkPortfolioModule],
  controllers: [SpvSpotlightsController],
  providers: [SpvSpotlightsService, SpvSpotlightAdminService, SpvSpotlightMailer],
  exports: [SpvSpotlightsService, SpvSpotlightAdminService],
})
export class SpvSpotlightsModule {}
