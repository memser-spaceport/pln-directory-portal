import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';

@Injectable()
export class TeamMemberRolesService {
  constructor(private prisma: PrismaService) {}

  async insertManyFromAirtable(
    airtableMembers: z.infer<typeof AirtableMemberSchema>[],
    airtableTeams: z.infer<typeof AirtableTeamSchema>[]
  ) {
    const teams = await this.prisma.team.findMany();
    const members = await this.prisma.member.findMany();
    const roles = await this.prisma.role.findMany();

    return this.prisma.$transaction(
      airtableMembers
        .filter(
          (airtableMember) =>
            !!airtableMember.fields?.Teams && !!airtableMember.fields?.Role
        )
        .map((airtableMember) => {
          const memberId = members.find(
            (member) => member.name === airtableMember.fields.Name
          )?.id;
          const teamId = teams.find(
            (team) =>
              airtableTeams.find((team) =>
                airtableMember.fields.Teams?.includes(team.id)
              )?.fields.Name === team.name
          )?.id;
          const roleId = roles.find(
            (role) => role.title === airtableMember.fields.Role
          )?.id;

          return this.prisma.teamMemberRole.upsert({
            where: {
              ...(memberId &&
                teamId &&
                roleId && {
                  memberId_teamId_roleId: { memberId, teamId, roleId },
                }),
            },
            update: {
              teamLead: airtableMember.fields['Team lead'] || false,
              ...(airtableMember.fields?.['PLN Start Date'] && {
                startDate: new Date(airtableMember.fields['PLN Start Date']),
              }),
              ...(airtableMember.fields?.['PLN End Date'] && {
                endDate: new Date(airtableMember.fields['PLN End Date']),
              }),
            },
            create: {
              mainRole: false, // there's no corresponding field on Airtable
              teamLead: airtableMember.fields['Team lead'] || false,
              ...(airtableMember.fields?.['PLN Start Date'] && {
                startDate: new Date(airtableMember.fields['PLN Start Date']),
              }),
              ...(airtableMember.fields?.['PLN End Date'] && {
                endDate: new Date(airtableMember.fields['PLN End Date']),
              }),
              member: {
                connect: {
                  id: memberId,
                },
              },
              team: {
                connect: {
                  id: teamId,
                },
              },
              role: {
                connect: {
                  id: roleId,
                },
              },
            },
          });
        })
    );
  }
}
