import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { AdminAccessControlV2Controller } from './controllers/admin-access-control-v2.controller';
import { DebugAccessControlV2Controller } from './controllers/debug-access-control-v2.controller';
import { SelfAccessControlV2Controller } from './controllers/self-access-control-v2.controller';
import { AdminAccessControlV2MetaController } from './controllers/admin-access-control-v2-meta.controller';
import { AccessControlV2Service } from './services/access-control-v2.service';

@Module({
  imports: [SharedModule],
  controllers: [
    AdminAccessControlV2Controller,
    DebugAccessControlV2Controller,
    SelfAccessControlV2Controller,
    AdminAccessControlV2MetaController,
  ],
  providers: [AccessControlV2Service, AdminAuthGuard, UserAuthValidateGuard, JwtService],
  exports: [AccessControlV2Service],
})
export class AccessControlV2Module {}
