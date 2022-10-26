import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FundingStagesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.fundingStage.findMany();
  }

  findOne(uid: string) {
    return this.prisma.fundingStage.findUniqueOrThrow({ where: { uid } });
  }
}
