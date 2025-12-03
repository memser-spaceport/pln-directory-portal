import { forwardRef, Module } from '@nestjs/common';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { PLEventsInternalController } from './pl-events.controller';
import { AuthModule } from '../auth/auth.module'
import { MembersController } from './members.controller';
import { MembersModule } from '../members/members.module';
import { CacheController } from './cache.controller';
import { EventsModule } from '../events/events.module';

@Module({
  controllers: [PLEventsInternalController, MembersController, CacheController],
  providers: [],
  exports: [],
  imports:[PLEventsModule, AuthModule, MembersModule, forwardRef(() => EventsModule)]
})
export class InternalsModule {}
