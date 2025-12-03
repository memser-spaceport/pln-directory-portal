import { Module } from '@nestjs/common';
import { ContactSupportService } from './contact-support.service';
import { ContactSupportController } from './contact-support.controller';

@Module({
  controllers: [ContactSupportController],
  providers: [ContactSupportService],
  exports: [ContactSupportService],
})
export class ContactSupportModule {}
