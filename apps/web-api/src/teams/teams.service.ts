import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.team.findMany();
  }

  findOne(uid: string) {
    return this.prisma.team.findUniqueOrThrow({ where: { uid } });
  }
}
