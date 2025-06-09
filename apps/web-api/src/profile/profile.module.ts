import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';

@Module({
  imports: [MembersModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
