import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { MemberInterestProfileController } from './member-interest-profile.controller';
import { MemberInterestProfileJob } from './member-interest-profile.job';
import { MemberInterestProfileService } from './member-interest-profile.service';

@Module({
  imports: [SharedModule],
  controllers: [MemberInterestProfileController],
  providers: [MemberInterestProfileService, MemberInterestProfileJob, JwtService],
  exports: [MemberInterestProfileService],
})
export class MemberInterestProfileModule {}
