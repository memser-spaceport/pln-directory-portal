import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MemberCvImportsModule } from '../member-cv-imports/member-cv-imports.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { IntegrationKeysService } from './integration-keys.service';
import { AdminIntegrationKeysController } from './admin-integration-keys.controller';
import { IntegrationsController } from './integrations.controller';
import { IntegrationCandidatesService } from './integration-candidates.service';
import { AtsPushService } from './ats-push.service';

/**
 * Team-scoped integration keys: admin issue/list/revoke, and the guard that
 * authenticates `/v1/integrations` routes. Feature modules that expose routes to
 * an integrated ATS import this module and mount their controllers under
 * `IntegrationKeyGuard`.
 */
@Module({
  imports: [SharedModule, MemberCvImportsModule],
  controllers: [AdminIntegrationKeysController, IntegrationsController],
  providers: [IntegrationKeysService, IntegrationKeyGuard, JwtService, IntegrationCandidatesService, AtsPushService],
  exports: [IntegrationKeysService, IntegrationKeyGuard, AtsPushService],
})
export class IntegrationKeysModule {}
