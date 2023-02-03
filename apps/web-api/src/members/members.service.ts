import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';

@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private fileMigrationService: FileMigrationService
  ) {}

  findAll(queryOptions: Prisma.MemberFindManyArgs) {
    return this.prisma.member.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.MemberFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.member.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyWithLocationsFromAirtable(
    airtableMembers: z.infer<typeof AirtableMemberSchema>[]
  ) {
    const skills = await this.prisma.skill.findMany();
    const images = await this.prisma.image.findMany();

    for (const member of airtableMembers) {
      if (!member.fields?.Name) {
        continue;
      }

      let image;

      if (member.fields['Profile picture']) {
        const ppf = member.fields['Profile picture'][0];
        image =
          images.find((image) => image.filename === ppf.filename) ||
          (await this.fileMigrationService.migrateFile({
            id: ppf.id || '',
            url: ppf.url || '',
            filename: ppf.filename || '',
            size: ppf.size || 0,
            type: ppf.type || '',
            height: ppf.height || 0,
            width: ppf.width || 0,
          }));
      }

      const optionalFieldsToAdd = Object.entries({
        email: 'Email',
        githubHandler: 'Github Handle',
        discordHandler: 'Discord handle',
        twitterHandler: 'Twitter',
        officeHours: 'Office hours link',
      }).reduce(
        (optionalFields, [prismaField, airtableField]) => ({
          ...optionalFields,
          ...(member.fields?.[airtableField] && {
            [prismaField]: member.fields?.[airtableField],
          }),
        }),
        {}
      );

      const manyToManyRelations = {
        skills: {
          connect: skills
            .filter(
              (skill) =>
                !!member.fields?.['Skills'] &&
                member.fields?.['Skills'].includes(skill.title)
            )
            .map((skill) => ({ id: skill.id })),
        },
      };

      const { location } = await this.locationTransferService.transferLocation(
        member
      );

      await this.prisma.member.upsert({
        where: {
          airtableRecId: member.id,
        },
        update: {
          ...optionalFieldsToAdd,
          ...manyToManyRelations,
        },
        create: {
          airtableRecId: member.id,
          name: member.fields.Name,
          plnFriend: member.fields['Friend of PLN'] || false,
          locationUid: location ? location?.uid : null,
          imageUid: image?.uid,
          ...optionalFieldsToAdd,
          ...manyToManyRelations,
        },
      });
    }
  }
}
