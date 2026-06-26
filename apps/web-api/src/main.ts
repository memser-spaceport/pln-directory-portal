// ⚠️ This import MUST come first!
// It sets up instrumentation and telemetry before anything else is loaded.
// Do NOT move this import below others — doing so may break logging, metrics, or tracing!
import './instrumentation';
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { mainConfig } from './main.config';
import { APP_ENV } from './utils/constants';
import { createForestAdminAgent } from './utils/forest-admin/agent';
import { SetupService } from './setup.service';
import { setupSwagger } from './swagger/swagger.setup';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new SetupService().setupLog(),
    bodyParser: false,
  });

  // Responsible for loading every major app configuration:
  mainConfig(app);

  // Swagger Documentation — three audience-scoped docs:
  //   /api/docs (user) · /api/admin/docs (back-office) · /api/internal/docs (service)
  setupSwagger(app);

  // Sentry - Error Reporting
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENVIRONMENT,
    enabled: process.env.ENVIRONMENT === APP_ENV.PRODUCTION || process.env.ENVIRONMENT === APP_ENV.STAGING,
  });

  // Create forest admin agent if the secret is set
  if (!!process.env.FOREST_AUTH_SECRET) {
    const agent = createForestAdminAgent();
    await agent.mountOnNestJs(app).start();
  }

  await app.listen(process.env.PORT || 3000);
}

bootstrap();
