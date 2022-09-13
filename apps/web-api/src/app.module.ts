import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { MembersModule } from './member/members.module';
import { PrismaService } from './prisma.service';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [MembersModule, HealthModule, TeamsModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
