import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberInvitesController } from './member-invites.controller';
import { MemberInvitesService } from './member-invites.service';

@Module({
  imports: [SharedModule],
  controllers: [MemberInvitesController],
  providers: [MemberInvitesService],
})
export class MemberInvitesModule {}
