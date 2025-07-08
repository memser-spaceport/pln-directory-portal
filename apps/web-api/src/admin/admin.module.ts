import {CacheModule, forwardRef, Module} from '@nestjs/common';
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
import {MemberService} from "./member.service";
import {AuthModule} from "../auth/auth.module";
import {OtpModule} from "../otp/otp.module";
import {HuskyModule} from "../husky/husky.module";
import {NotificationSettingsModule} from "../notification-settings/notification-settings.module";

@Module({
  imports: [CacheModule.register(),
    SharedModule,
    RecommendationsModule,
    AuthModule,
    OtpModule,
    forwardRef(() => ParticipantsRequestModule),
    HuskyModule,
    NotificationSettingsModule,
    forwardRef(() => MembersModule)],
  controllers: [AdminParticipantsRequestController, AdminAuthController, MemberController, RecommendationsController],
  exports: [MemberService],
  providers: [AdminService, MemberService, JwtService],
})
export class AdminModule {}
