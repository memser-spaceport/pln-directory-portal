import { CacheModule, Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { SharedModule } from '../shared/shared.module';
import { AdminParticipantsRequestController } from './participants-request.controller';
import { AdminAuthController } from './auth.controller';
import { MemberController } from './member.controller';
import { MembersModule } from '../members/members.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsModule } from '../recommendations/recommendations.module';

@Module({
  imports: [CacheModule.register(), ParticipantsRequestModule, SharedModule, MembersModule, RecommendationsModule],
  controllers: [AdminParticipantsRequestController, AdminAuthController, MemberController, RecommendationsController],
  providers: [AdminService, JwtService],
})
export class AdminModule {}
