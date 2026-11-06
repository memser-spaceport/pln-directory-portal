import { Global, Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberSignalsController } from './member-signals.controller';
import { MemberSignalsService } from './member-signals.service';

/**
 * Global so every module that owns a recorded action (follows, news, feed, job
 * board, office hours) can inject the writer without a new import edge.
 */
@Global()
@Module({
  imports: [SharedModule],
  controllers: [MemberSignalsController],
  providers: [MemberSignalsService],
  exports: [MemberSignalsService],
})
export class MemberSignalsModule {}
