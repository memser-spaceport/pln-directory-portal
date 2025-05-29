import { CacheModule, Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { MasterDataService } from './master-data.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { SharedModule } from '../shared/shared.module';
import { AdminParticipantsRequestController } from './participants-request.controller';
import { AdminAuthController } from './auth.controller';
import { AdminMasterDataController } from './master-data.controller';
@Module({
  imports: [CacheModule.register(), ParticipantsRequestModule, SharedModule],
  controllers: [AdminParticipantsRequestController, AdminAuthController, AdminMasterDataController],
  providers: [
    AdminService,
    MasterDataService,
    JwtService
  ],
})
export class AdminModule {}
