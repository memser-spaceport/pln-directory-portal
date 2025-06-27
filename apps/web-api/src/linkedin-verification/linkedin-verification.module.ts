import { Module } from '@nestjs/common';
import { LinkedInVerificationController } from './linkedin-verification.controller';
import { LinkedInVerificationService } from './linkedin-verification.service';
import { PrismaService } from '../shared/prisma.service';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [MembersModule],
  controllers: [LinkedInVerificationController],
  providers: [LinkedInVerificationService, PrismaService],
  exports: [LinkedInVerificationService],
})
export class LinkedInVerificationModule {}
