import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { MembersModule } from '../members/members.module';
import { AskModule } from '../asks/asks.module';
import { AskService } from '../asks/asks.service';

@Module({
  imports: [MembersModule, AskModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, AskService],
  exports: [ProjectsService]
})
export class ProjectsModule {}
