import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { mainConfig } from './main.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'verbose'],
  });

  // Responsible for loading every major app configuration:
  mainConfig(app);

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Protocol Labs Network Directory API')
    .setDescription('The Protocol Labs Network Directory API documentation')
    .setVersion('1.0')
    .addTag('PL')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Sentry - Error Reporting
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENVIRONMENT,
    enabled:
      process.env.ENVIRONMENT === 'production' ||
      process.env.ENVIRONMENT === 'staging',
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
