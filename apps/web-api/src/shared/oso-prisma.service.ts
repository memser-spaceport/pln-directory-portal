import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '.prisma/oso-client';

@Injectable()
export class OsoPrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      throw error;
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit', async () => {
      await app.close();
    });
  }
}
