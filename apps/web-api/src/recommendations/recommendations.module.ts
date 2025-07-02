import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsJob } from './recommendations.job';
import { RecommendationsController } from './recommendations.controller';
import { SharedModule } from '../shared/shared.module';
import { HuskyModule } from '../husky/husky.module';

@Module({
  imports: [SharedModule, HuskyModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, RecommendationsJob],
  exports: [RecommendationsService, RecommendationsJob],
})
export class RecommendationsModule {}
