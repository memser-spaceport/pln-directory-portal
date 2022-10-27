import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.skill.findMany();
  }

  findOne(uid: string) {
    return this.prisma.skill.findUniqueOrThrow({ where: { uid } });
  }
}
