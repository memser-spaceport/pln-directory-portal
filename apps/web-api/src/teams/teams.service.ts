import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll(queryOptions: Prisma.TeamFindManyArgs) {
    return this.prisma.team.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.TeamFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.team.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromAirtable(
    airtableTeams: z.infer<typeof AirtableTeamSchema>[]
  ) {
    const fundingStages = await this.prisma.fundingStage.findMany();
    const industryTags = await this.prisma.industryTag.findMany();
    const technologies = await this.prisma.technology.findMany();
    const acceleratorPrograms = await this.prisma.acceleratorProgram.findMany();

    return this.prisma.$transaction(
      airtableTeams.map((team) => {
        const optionalFieldsToAdd = Object.entries({
          blog: 'Blog',
          website: 'Website',
          twitterHandler: 'Twitter',
          shortDescription: 'Short description',
          longDescription: 'Long description',
          plnFriend: 'Friend of PLN',
          filecoinUser: 'Filecoin User',
          ipfsUser: 'IPFS User',
        }).reduce(
          (optionalFields, [prismaField, airtableField]) => ({
            ...optionalFields,
            ...(team.fields?.[airtableField] && {
              [prismaField]: team.fields?.[airtableField],
            }),
          }),
          {}
        );

        const oneToManyRelations = {
          fundingStageUid:
            fundingStages.find(
              (fundingStage) =>
                fundingStage.title === team.fields?.['Funding Stage']
            )?.uid || null,
        };

        const manyToManyRelations = {
          industryTags: {
            connect: industryTags
              .filter(
                (tag) =>
                  !!team.fields?.['Tags lookup'] &&
                  team.fields?.['Tags lookup'].includes(tag.title)
              )
              .map((tag) => ({ id: tag.id })),
          },
          acceleratorPrograms: {
            connect: acceleratorPrograms
              .filter(
                (program) =>
                  !!team.fields?.['Accelerator Programs'] &&
                  team.fields?.['Accelerator Programs'].includes(program.title)
              )
              .map((tag) => ({ id: tag.id })),
          },
          technologies: {
            connect: technologies
              .filter(
                (tech) =>
                  (team.fields?.['Filecoin User'] &&
                    tech.title === 'Filecoin') ||
                  (team.fields?.['IPFS User'] && tech.title === 'IPFS')
              )
              .map((tech) => ({ id: tech.id })),
          },
        };

        return this.prisma.team.upsert({
          where: { name: team.fields.Name },
          update: {
            ...optionalFieldsToAdd,
            ...oneToManyRelations,
            ...manyToManyRelations,
          },
          create: {
            name: team.fields.Name,
            plnFriend: team.fields['Friend of PLN'] || false,
            filecoinUser: team.fields['Filecoin User'] || false,
            ipfsUser: team.fields['IPFS User'] || false,
            ...optionalFieldsToAdd,
            ...oneToManyRelations,
            ...manyToManyRelations,
            ...(team.fields?.['Created'] && {
              createdAt: new Date(team.fields['Created']),
            }),
            ...(team.fields?.['Last Modified'] && {
              updatedAt: new Date(team.fields['Last Modified']),
            }),
          },
        });
      })
    );
  }
}
