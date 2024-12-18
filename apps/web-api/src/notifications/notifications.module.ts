import { Module } from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from '../shared/prisma.service'; 

@Module({
  controllers: [],
  providers: [NotificationService, PrismaService],
  exports: [NotificationService],
  imports: [  
    BullModule.registerQueue({
      name: 'notifications',
    })
  ]
})
export class NotificationsModule {}