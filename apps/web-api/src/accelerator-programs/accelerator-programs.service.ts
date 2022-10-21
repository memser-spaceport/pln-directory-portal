import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AcceleratorProgramsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.acceleratorProgram.findMany();
  }

  findOne(uid: string) {
    return this.prisma.acceleratorProgram.findUniqueOrThrow({ where: { uid } });
  }
}
