import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { MembersModule } from '../members/members.module';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';

@Module({
  imports: [MembersModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
