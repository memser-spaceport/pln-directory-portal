import { Module } from '@nestjs/common';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { PLEventsInternalController } from './pl-events.controller';
import { AuthModule } from '../auth/auth.module'
import { MembersController } from './members.controller';
import { MembersModule } from '../members/members.module';
import { CacheController } from './cache.controller';
import { InternalsController } from './internals.controller';
import { InternalsService } from './internals.service';
import { HuskyModule } from '../husky/husky.module';

@Module({
  controllers: [PLEventsInternalController, MembersController, CacheController, InternalsController],
  providers: [InternalsService],
  exports: [InternalsService],
  imports:[PLEventsModule, AuthModule, MembersModule]
})
export class InternalsModule {}
