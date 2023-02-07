import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as path from 'path';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { hashFileName } from '../utils/hashing';

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private fileMigrationService: FileMigrationService
  ) {}

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
    const membershipSources = await this.prisma.membershipSource.findMany();
    const images = await this.prisma.image.findMany();

    for (const team of airtableTeams) {
      const optionalFieldsToAdd = Object.entries({
        blog: 'Blog',
        website: 'Website',
        twitterHandler: 'Twitter',
        shortDescription: 'Short description',
        contactMethod: 'Preferred Method of Contact',
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
        membershipSources: {
          connect: membershipSources
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
                (team.fields?.['Filecoin User'] && tech.title === 'Filecoin') ||
                (team.fields?.['IPFS User'] && tech.title === 'IPFS')
            )
            .map((tech) => ({ id: tech.id })),
        },
      };

      let image;

      if (team.fields.Logo) {
        const logo = team.fields.Logo[0];

        const hashedLogo = logo.filename
          ? hashFileName(path.parse(logo.filename).name)
          : '';
        image =
          images.find(
            (image) => path.parse(image.filename).name === hashedLogo
          ) ||
          (await this.fileMigrationService.migrateFile({
            id: logo.id ? logo.id : '',
            url: logo.url ? logo.url : '',
            filename: logo.filename ? logo.filename : '',
            size: logo.size ? logo.size : 0,
            type: logo.type ? logo.type : '',
            height: logo.height ? logo.height : 0,
            width: logo.width ? logo.width : 0,
          }));
      }

      await this.prisma.team.upsert({
        where: { airtableRecId: team.id },
        update: {
          ...optionalFieldsToAdd,
          ...oneToManyRelations,
          ...manyToManyRelations,
        },
        create: {
          airtableRecId: team.id,
          name: team.fields.Name,
          plnFriend: team.fields['Friend of PLN'] || false,
          filecoinUser: team.fields['Filecoin User'] || false,
          ipfsUser: team.fields['IPFS User'] || false,
          logoUid: image && image.uid ? image.uid : undefined,
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
    }
  }
}
