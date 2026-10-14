// FEATURE-ENV ONLY — never merge: SES recipient allowlist, installed before CommandModule (and anything that can send) loads.
import './utils/aws/feature-env-email-guard.install';
import dotenv from 'dotenv';
import { CommandFactory } from 'nest-commander';
import { CommandModule } from './command.module';

export async function bootstrap() {
  dotenv.config();
  await CommandFactory.run(CommandModule);
}

bootstrap();
