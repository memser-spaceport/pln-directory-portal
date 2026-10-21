import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { ManualFieldLockModule } from '../manual-field-lock/manual-field-lock.module';
import { WarmIntrosV2Service } from './warm-intros-v2.service';
import { WarmIntrosV2RunService } from './warm-intros-v2-run.service';
import { WarmIntrosV2ServiceController } from './warm-intros-v2-service.controller';
import { WarmIntrosV2Controller } from './warm-intros-v2.controller';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module, ManualFieldLockModule],
  controllers: [WarmIntrosV2ServiceController, WarmIntrosV2Controller],
  providers: [WarmIntrosV2Service, WarmIntrosV2RunService],
  exports: [WarmIntrosV2Service],
})
export class WarmIntrosV2Module {}
