import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { MembersModule } from './members/members.module';
import { PrismaService } from './prisma.service';
import { TeamsModule } from './teams/teams.module';
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 1,
      limit: 5,
    }),
    MembersModule,
    HealthModule,
    TeamsModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
