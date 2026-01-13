import dotenv from 'dotenv';
import { CommandFactory } from 'nest-commander';
import { EnrichFundsModule } from './commands/enrich-funds/enrich-funds.module';

export async function bootstrap() {
  dotenv.config();
  try {
    await CommandFactory.run(EnrichFundsModule, {
      logger: ['error', 'warn'],
      errorHandler: (err) => {
        console.error('[ERROR]', err.message || err);
        process.exit(1);
      },
    });
  } catch (error) {
    console.error('[ERROR]', error.message || error);
    process.exit(1);
  }
}

bootstrap().catch((err) => {
  console.error('[ERROR] CLI failed:', err.message || err);
  process.exit(1);
});
