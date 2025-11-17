import { Module, forwardRef } from '@nestjs/common';
import { MembershipSourcesController } from './membership-sources.controller';
import { MembershipSourcesService } from './membership-sources.service';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [forwardRef(() => TeamsModule)],
  controllers: [MembershipSourcesController],
  providers: [MembershipSourcesService],
})
export class MembershipSourcesModule {}
