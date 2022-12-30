import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async insertManyFromList(roles: string[]) {
    const uniqueRoles = Array.from(new Set(roles));
    return await this.prisma.$transaction(
      uniqueRoles.map((role) =>
        this.prisma.role.upsert({
          where: { title: role },
          update: {},
          create: {
            title: role,
          },
        })
      )
    );
  }
}
