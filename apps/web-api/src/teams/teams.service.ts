import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { Prisma, ParticipantType } from '@prisma/client';
import * as path from 'path';
import { z } from 'zod';
import { PrismaService } from '../shared/prisma.service';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { hashFileName } from '../utils/hashing';
import { ParticipantRequestTeamSchema } from 'libs/contracts/src/schema/participants-request';

@Injectable()
export class TeamsService {
  constructor(
    private prisma: PrismaService,
    private fileMigrationService: FileMigrationService,
    private participantsRequestService: ParticipantsRequestService
  ) {}

  async findAll(queryOptions: Prisma.TeamFindManyArgs) {
    return this.prisma.team.findMany({
      ...queryOptions,
      orderBy: {
        name: 'asc',
      },
    });
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.TeamFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.team.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
      include: {
        fundingStage: true,
        industryTags: true,
        logo: true,
        membershipSources: true,
        technologies: true,
        maintainingProjects:{
          orderBy: [
            {
              name: 'asc'
            }
          ],
          include: {
            logo: { select: { url: true, uid: true } },     
            maintainingTeam: {
              select: {
                name: true,
                logo: { select: { url: true, uid: true } },
              },
            },
          }
        },
        contributingProjects: {
          orderBy: [
            {
              name: 'asc'
            }
          ],
          include: {
            logo: { select: { url: true, uid: true } },     
            maintainingTeam: {
              select: {
                name: true,
                logo: { select: { url: true, uid: true } },
              },
            },
          }
        }
      },
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
          ? hashFileName(`${path.parse(logo.filename).name}-${logo.id}`)
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

  async editTeamParticipantsRequest(participantsRequest, userEmail) {
    const { referenceUid } = participantsRequest;
    const requestorDetails =
      await this.participantsRequestService.findMemberByEmail(userEmail);
    if (!requestorDetails) {
      throw new UnauthorizedException();
    }
    if (
      !requestorDetails.isDirectoryAdmin &&
      !requestorDetails.leadingTeams?.includes(referenceUid)
    ) {
      throw new ForbiddenException();
    }
    participantsRequest.requesterEmailId = requestorDetails.email;
    if (
      participantsRequest.participantType === ParticipantType.TEAM.toString() &&
      !ParticipantRequestTeamSchema.safeParse(participantsRequest).success
    ) {
      throw new BadRequestException();
    }
    let result;
    try {
      await this.prisma.$transaction(async (tx) => {
        result = await this.participantsRequestService.addRequest(
          participantsRequest,
          true,
          tx
        );
        if (result?.uid) {
          result = await this.participantsRequestService.processTeamEditRequest(
            result.uid,
            true, // disable the notification
            true, // enable the auto approval
            tx
          );
        } else {
          throw new InternalServerErrorException();
        }
      });
    } catch (error) {
      if (error?.response?.statusCode && error?.response?.message) {
        throw new HttpException(
          error?.response?.message,
          error?.response?.statusCode
        );
      } else {
        throw new BadRequestException(
          'Oops, something went wrong. Please try again!'
        );
      }
    }
    return result;
  }
}
