import { Injectable } from '@nestjs/common';
import { Prisma, Team } from '@prisma/client';
import { CreateTeamSchemaDto } from 'libs/contracts/src/schema/team';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findOne(
    teamWhereUniqueInput: Prisma.TeamWhereUniqueInput
  ): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: teamWhereUniqueInput,
      include: {
        members: true,
      },
    });
  }

  async findAll(): Promise<Team[]> {
    return this.prisma.team.findMany();
  }

  create(createTeamInput: Prisma.TeamCreateInput) {
    return this.prisma.team.create({
      data: createTeamInput,
    });
  }

  async update(
    updateTeamInput: CreateTeamSchemaDto,
    where: Prisma.TeamWhereUniqueInput
  ): Promise<Team | null> {
    return this.prisma.team.update({
      where,
      data: updateTeamInput,
    });
  }

  async delete(where: Prisma.TeamWhereUniqueInput): Promise<Team | null> {
    return this.prisma.team.delete({
      where,
    });
  }
}
