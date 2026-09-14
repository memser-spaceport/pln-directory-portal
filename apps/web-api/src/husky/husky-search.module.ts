import { Module } from '@nestjs/common';
import { HuskyModule } from './husky.module';
import { HuskyAiService } from './husky-ai.service';
import { HuskyChatsController } from './husky-chats.controller';
import { HuskyThreadsController } from './husky-threads.controller';
import { HuskyAiToolsModule } from './tools/husky-ai-tools.module';

/**
 * The AI-search-specific slice of Husky, split out of HuskyModule so its
 * tool-calling stack — which reaches into JobOpeningsModule/TeamNewsModule/
 * DemoDaysModule to answer search questions — never becomes part of the
 * widely-depended-on HuskyModule's own import graph. HuskyModule is imported
 * directly (no forwardRef needed) by ~10 unrelated modules for its narrower
 * services (HuskyRevalidationService, HuskyGenerationService, etc.); if this
 * module's heavier dependencies lived there too, every one of those consumers
 * would risk a require()-time circular-dependency crash. Only AppModule
 * imports this module.
 */
@Module({
  imports: [HuskyModule, HuskyAiToolsModule],
  controllers: [HuskyChatsController, HuskyThreadsController],
  providers: [HuskyAiService],
  exports: [HuskyAiService],
})
export class HuskySearchModule {}
