import { Module } from '@nestjs/common';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { OtpModule } from '../otp/otp.module';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    OtpModule,
    ParticipantsRequestModule
  ],
  providers: [
    MembersService
  ],
  controllers: [MemberController],
  exports: [MembersService]
})
export class MembersModule {}
