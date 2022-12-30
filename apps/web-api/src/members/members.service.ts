import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

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

    for (const member of airtableMembers) {
      if (!member.fields?.Name) {
        continue;
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

      // TODO: Create or connect location

      await this.prisma.member.upsert({
        where: {
          name: member.fields.Name,
        },
        update: {
          ...optionalFieldsToAdd,
          ...manyToManyRelations,
        },
        create: {
          name: member.fields.Name,
          plnFriend: member.fields['Friend of PLN'] || false,
          ...manyToManyRelations,
        },
      });
    }
  }
}
