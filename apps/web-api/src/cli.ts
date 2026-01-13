import dotenv from 'dotenv';
import { CommandFactory } from 'nest-commander';
import { CommandModule } from './command.module';

export async function bootstrap() {
  console.log('[CLI] Bootstrap starting...');
  dotenv.config();
  try {
    await CommandFactory.run(CommandModule, {
      logger: ['error', 'warn', 'log'],
      errorHandler: (err) => {
        console.error('[CLI] Command error:', err);
        process.exit(1);
      },
    });
    console.log('[CLI] Command completed');
  } catch (error) {
    console.error('[CLI] Error:', error);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  console.error('[CLI] Bootstrap failed:', err);
  process.exit(1);
});
