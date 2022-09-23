import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

const origin = {
  development: /localhost/,
  staging: /.-protocol-labs-spaceport.vercel.app/,
  production: 'https://www.plnetwork.io',
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'verbose'],
  });

  const config = new DocumentBuilder()
    .setTitle('Protocol Labs Network Directory API')
    .setDescription('The Protocol Labs Network Directory API documentation')
    .setVersion('1.0')
    .addTag('PL')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.enableVersioning({
    type: VersioningType.URI,
  });

  app.enableCors({
    origin: origin[process.env.ENVIRONMENT],
  });

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
