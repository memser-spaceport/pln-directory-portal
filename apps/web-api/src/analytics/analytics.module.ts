import { Module, Global } from '@nestjs/common';
import { AnalyticsService } from './service/analytics.service';
import { PostHogProvider } from './provider/posthog.provider';
import { ConsoleProvider } from './provider/console.provider';
import {PrismaService} from "../shared/prisma.service";
import {DbProvider} from "./provider/db.provider";
import {HybridConsoleDbProvider} from "./provider/hybrid.provider";
import {AnalyticsController} from "./analytics.controller";
import {AnalyticsReadService} from "./service/analytics.read.service";

/**
 * Global analytics module that provides the AnalyticsService
 * Automatically configures the appropriate provider based on environment
 */
@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [
    PostHogProvider,
    ConsoleProvider,
    DbProvider,
    HybridConsoleDbProvider,
    AnalyticsService,
    PrismaService,
    AnalyticsReadService
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
