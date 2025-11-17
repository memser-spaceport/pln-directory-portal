import { Module, forwardRef } from '@nestjs/common';
import { IndustryTagsController } from './industry-tags.controller';
import { IndustryTagsService } from './industry-tags.service';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [forwardRef(() => TeamsModule)],
  controllers: [IndustryTagsController],
  providers: [IndustryTagsService],
})
export class IndustryTagsModule {}
