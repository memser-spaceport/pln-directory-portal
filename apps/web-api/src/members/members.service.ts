import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.member.findMany();
  }

  findOne(uid: string) {
    return this.prisma.member.findUniqueOrThrow({ where: { uid } });
  }
}
