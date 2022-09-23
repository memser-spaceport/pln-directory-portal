import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { HealthModule } from './health/health.module';
import { MembersModule } from './members/members.module';
import { PrismaService } from './prisma.service';
import { TeamsModule } from './teams/teams.module';

@Module({
  controllers: [AppController],
  imports: [MembersModule, HealthModule, TeamsModule],
  providers: [PrismaService],
})
export class AppModule {}
