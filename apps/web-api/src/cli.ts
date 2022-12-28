import dotenv from 'dotenv';
import { CommandFactory } from 'nest-commander';
import { CommandModule } from './command.module';

async function bootstrap() {
  dotenv.config();
  await CommandFactory.run(CommandModule);
}

bootstrap();
