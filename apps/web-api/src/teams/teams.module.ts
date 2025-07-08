import { Module, forwardRef } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamsHooksService } from './teams.hooks.service';
import { SharedModule } from '../shared/shared.module';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { MembersModule } from '../members/members.module';
import { AskModule } from '../asks/asks.module';
import { HuskyModule } from '../husky/husky.module';
import {AdminModule} from "../admin/admin.module";

@Module({
  imports: [
    forwardRef(() => ParticipantsRequestModule),
    forwardRef(() => MembersModule),
    forwardRef(() => AdminModule),
    SharedModule,
    forwardRef(() => AskModule),
    HuskyModule,
  ],
  controllers: [TeamsController],
  providers: [TeamsService, TeamsHooksService],
  exports: [TeamsService, TeamsHooksService],
})
export class TeamsModule {}
