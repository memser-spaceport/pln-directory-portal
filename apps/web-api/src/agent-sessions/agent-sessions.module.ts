import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { RbacModule } from '../rbac/rbac.module';
import { AgentSessionsController } from './agent-sessions.controller';
import { AgentSessionsService } from './agent-sessions.service';

@Module({
  imports: [RbacModule, AccessControlV2Module],
  controllers: [AgentSessionsController],
  providers: [AgentSessionsService],
})
export class AgentSessionsModule {}
