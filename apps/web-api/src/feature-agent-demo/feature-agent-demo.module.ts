import { Module } from '@nestjs/common';
import { FeatureAgentDemoController } from './feature-agent-demo.controller';
import { FeatureAgentDemoService } from './feature-agent-demo.service';

@Module({
  controllers: [FeatureAgentDemoController],
  providers: [FeatureAgentDemoService],
})
export class FeatureAgentDemoModule {}
