import { CacheModule, Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { ParticipantsRequestModule } from '../participants-request/participants-request.module';
import { SharedModule } from '../shared/shared.module';
import { AdminParticipantsRequestController } from './participants-request.controller';
import { AdminAuthController } from './auth.controller';
@Module({
  imports: [CacheModule.register(), ParticipantsRequestModule, SharedModule],
  controllers: [AdminParticipantsRequestController, AdminAuthController],
  providers: [
    AdminService,
    JwtService
  ],
})
export class AdminModule {}
