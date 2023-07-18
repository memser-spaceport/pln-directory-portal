import { Module } from '@nestjs/common';
import { EmailOtpService } from './email-otp.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [],
  controllers: [],
  providers: [EmailOtpService],
  exports: [EmailOtpService],
})
export class OtpModule {}
