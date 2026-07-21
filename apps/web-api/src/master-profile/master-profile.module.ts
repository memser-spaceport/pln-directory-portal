import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { MasterProfileService } from './master-profile.service';
import { MasterProfileServiceController } from './master-profile-service.controller';
import { MasterProfileController } from './master-profile.controller';

@Module({
  imports: [SharedModule, RbacModule, AccessControlV2Module],
  controllers: [MasterProfileServiceController, MasterProfileController],
  providers: [MasterProfileService],
  exports: [MasterProfileService],
})
export class MasterProfileModule {}
