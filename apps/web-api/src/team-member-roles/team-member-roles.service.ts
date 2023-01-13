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

    return this.prisma.$transaction(
      airtableMembers
        .filter((airtableMember) => !!airtableMember.fields?.Teams)
        .map((airtableMember) => {
          const memberUid = members.find(
            (member) => member.name === airtableMember.fields.Name
          )?.uid;
          const teamUids = teams
            .filter((team) =>
              airtableTeams
                .filter((airtableTeam) =>
                  airtableMember.fields.Teams?.includes(airtableTeam.id)
                )
                .map((airtableTeam) => airtableTeam?.fields.Name)
                .includes(team.name)
            )
            .map((team) => team.uid);

          return teamUids.map((teamUid, index) =>
            this.prisma.teamMemberRole.upsert({
              where: {
                ...(memberUid &&
                  teamUid && {
                    memberUid_teamUid: { memberUid, teamUid },
                  }),
              },
              update: {
                ...(airtableMember.fields?.['Role'] &&
                  index === 0 && {
                    role: airtableMember.fields['Role'],
                  }),
                teamLead: airtableMember.fields['Team lead'] || false,
                ...(airtableMember.fields?.['PLN Start Date'] && {
                  startDate: new Date(airtableMember.fields['PLN Start Date']),
                }),
                ...(airtableMember.fields?.['PLN End Date'] && {
                  endDate: new Date(airtableMember.fields['PLN End Date']),
                }),
              },
              create: {
                ...(airtableMember.fields?.['Role'] &&
                  index === 0 && {
                    role: airtableMember.fields['Role'],
                  }),
                mainTeam: false,
                teamLead: airtableMember.fields['Team lead'] || false,
                ...(airtableMember.fields?.['PLN Start Date'] && {
                  startDate: new Date(airtableMember.fields['PLN Start Date']),
                }),
                ...(airtableMember.fields?.['PLN End Date'] && {
                  endDate: new Date(airtableMember.fields['PLN End Date']),
                }),
                member: {
                  connect: {
                    uid: memberUid,
                  },
                },
                team: {
                  connect: {
                    uid: teamUid,
                  },
                },
              },
            })
          );
        })
        .reduce((upserts, listOfUpserts) => [...upserts, ...listOfUpserts])
    );
  }
}
