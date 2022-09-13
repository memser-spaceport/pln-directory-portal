import { Injectable } from '@nestjs/common';
import { Prisma, Team } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findOne(
    teamWhereUniqueInput: Prisma.TeamWhereUniqueInput,
  ): Promise<Team | null> {
    return this.prisma.team.findUnique({
      where: teamWhereUniqueInput,
      include: {
        members: true,
      },
    });
  }

  async findAll(): Promise<Team[]> {
    return [
      {
        id: 2,
        uid: '1',
        name: 'Team 1',
        logo: 'logo',
        blog: 'blog',
        website: 'website',
        twitterHandler: 'twitterHandler',
        shortDescripton: 'shortDescripton',
        longDescripton: 'longDescripton',
        filecoinUser: true,
        ipfsUser: true,
        plnFriend: true,
        startDate: new Date(),
        endDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        fundingStageUid: 'fundingStageUid',
      },
    ];
    return this.prisma.team.findMany({
      include: {
        members: true,
      },
    });
  }

  create(createTeamInput: Prisma.TeamCreateInput) {
    return this.prisma.team.create({
      data: createTeamInput,
    });
  }

  async update(
    updateTeamInput: UpdateTeamDto,
    where: Prisma.TeamWhereUniqueInput,
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
