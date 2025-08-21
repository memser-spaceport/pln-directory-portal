import { Module } from '@nestjs/common';
import { MemberInteractionAdjustmentsService } from './member-interaction-adjustments.service';

@Module({
  imports: [],
  providers: [MemberInteractionAdjustmentsService],
  exports: [MemberInteractionAdjustmentsService],
})
export class MemberInteractionAdjustmentsModule {}
