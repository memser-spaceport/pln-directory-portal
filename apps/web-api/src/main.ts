import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { mainConfig } from './main.config';
import { APP_ENV } from './utils/constants';
import agent from './utils/forest-admin/agent';
import { SetupService } from './setup.service';

export async function bootstrap() {
  console.log('--- bootstrap ---');
  const app = await NestFactory.create(AppModule, {
    logger: new SetupService().setupLog(),
  });
  console.log('--- after NestFactory.create ---');
  // Responsible for loading every major app configuration:
  console.log('--- before mainConfig ---');
  mainConfig(app);
  console.log('--- mainConfig ---');
  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Protocol Labs Directory API')
    .setDescription('The Protocol Labs Directory API documentation')
    .setVersion('1.0')
    .addTag('PL')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
 console.log('before sentry init..........');
  // Sentry - Error Reporting
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENVIRONMENT,
    enabled:
      process.env.ENVIRONMENT === APP_ENV.PRODUCTION ||
      process.env.ENVIRONMENT === APP_ENV.STAGING,
  });
  console.log('--- before agent.mountOnNestJs ---');
  await agent.mountOnNestJs(app).start();
  console.log('--- before app.listen ---');
  await app.listen(process.env.PORT || 3000);
}

bootstrap();
