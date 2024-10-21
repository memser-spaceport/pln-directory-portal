import { Module } from '@nestjs/common';
import { PLEventsModule } from '../pl-events/pl-events.module';
import { PLEventsInternalController } from './pl-events.controller';
import { AuthModule } from '../auth/auth.module'

@Module({
  controllers: [PLEventsInternalController],
  providers: [],
  exports: [],
  imports:[PLEventsModule, AuthModule]
})
export class InternalsModule {}
