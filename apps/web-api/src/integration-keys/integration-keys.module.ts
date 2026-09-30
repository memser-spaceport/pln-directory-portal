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
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { MemberSignInController } from './member-sign-in.controller';
import { MemberSignInService } from './member-sign-in.service';

/**
 * Team-scoped integration keys: admin issue/list/revoke, and the guard that
 * authenticates `/v1/integrations` routes. Feature modules that expose routes to
 * an integrated ATS import this module and mount their controllers under
 * `IntegrationKeyGuard`.
 */
@Module({
  imports: [SharedModule, MemberCvImportsModule, AccessControlV2Module],
  controllers: [AdminIntegrationKeysController, IntegrationsController, MemberSignInController],
  providers: [
    IntegrationKeysService,
    IntegrationKeyGuard,
    JwtService,
    IntegrationCandidatesService,
    AtsPushService,
    MemberSignInService,
  ],
  exports: [IntegrationKeysService, IntegrationKeyGuard, AtsPushService],
})
export class IntegrationKeysModule {}
