import {forwardRef, Module} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { MembersModule } from '../members/members.module';
import { AskModule } from '../asks/asks.module';
import { HuskyModule } from '../husky/husky.module';
import {AdminModule} from "../admin/admin.module";

@Module({
  imports: [MembersModule, forwardRef(() => AdminModule), AskModule, HuskyModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
