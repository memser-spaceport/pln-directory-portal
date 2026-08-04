import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AgentSessionsController } from './agent-sessions.controller';
import { AgentSessionsService } from './agent-sessions.service';

@Module({
  imports: [RbacModule],
  controllers: [AgentSessionsController],
  providers: [AgentSessionsService],
})
export class AgentSessionsModule {}
