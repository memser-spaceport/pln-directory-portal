import { Module } from '@nestjs/common';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { RbacModule } from '../rbac/rbac.module';
import { SharedModule } from '../shared/shared.module';
import { AwsService } from '../utils/aws/aws.service';
import { AiAppsController } from './ai-apps.controller';
import { AiAppsService } from './ai-apps.service';
import { AiAppsConnectService } from './ai-apps-connect.service';
import { AiAppsStarterKitService } from './ai-apps-starter-kit.service';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module],
  controllers: [AiAppsController],
  providers: [AiAppsService, AiAppsConnectService, AiAppsStarterKitService, AiAppTokenGuard, AwsService],
  exports: [AiAppsService],
})
export class AiAppsModule {}
