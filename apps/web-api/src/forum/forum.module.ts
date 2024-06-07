import { Module } from '@nestjs/common';
import { ForumService } from './forum.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [ForumService],
  exports: [ForumService]
})
export class ForumModule {}
