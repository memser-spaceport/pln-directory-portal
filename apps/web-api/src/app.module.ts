import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { MemberModule } from './member/member.module';
import { PrismaService } from './prisma.service';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [MemberModule, HealthModule, TeamsModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
