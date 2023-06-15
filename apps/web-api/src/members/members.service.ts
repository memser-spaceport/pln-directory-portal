import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ParticipantType, Prisma } from '@prisma/client';
import * as path from 'path';
import { z } from 'zod';
import { PrismaService } from '../shared/prisma.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { hashFileName } from '../utils/hashing';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { ParticipantRequestMemberSchema } from 'libs/contracts/src/schema/participants-request';
import axios from 'axios';
import { LogService } from '../shared/log.service';

@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private participantsRequestService: ParticipantsRequestService,
    private fileMigrationService: FileMigrationService,
    private logService: LogService
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
      include: {
        image: true,
        location: true,
        skills: true,
        memberRoles: true,
        teamMemberRoles: {
          include: {
            team: {
              include: {
                logo: true,
              },
            },
          },
        },
      },
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

        const hashedPpf = ppf.filename
          ? hashFileName(`${path.parse(ppf.filename).name}-${ppf.id}`)
          : '';

        image =
          images.find(
            (image) => path.parse(image.filename).name === hashedPpf
          ) ||
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

  async getRepositories(githubHandle) {
    let repositories = [];
    repositories = await axios
      .post(
        'https://api.github.com/graphql',
        {
          query: `{
          user(login: "${githubHandle}") {
            pinnedItems(first: 10, types: REPOSITORY) {
              nodes {
                ... on RepositoryInfo {
                  name
                  description
                  url
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }`,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      )
      .then((v) => v.data.data.user?.pinnedItems?.nodes)
      .catch((e) => console.log(e));

    if (!repositories?.length) {
      repositories = await axios
        .get(`https://api.github.com/users/${githubHandle}/repos`)
        .then((v) => {
          const repoArray = v.data.map((item) => {
            return {
              name: item.name,
              description: item.description,
              url: item.html_url,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
            };
          });
          return repoArray;
        })
        .catch((e) => console.log(e.message));
    }
    return repositories;
  }

  async editMemberParticipantsRequest(participantsRequest, userEmail) {
    const { referenceUid } = participantsRequest;
    const requestorDetails =
      await this.participantsRequestService.findMemberByEmail(userEmail);
    if (!requestorDetails) {
      throw new UnauthorizedException();
    }
    if (
      !requestorDetails.isDirectoryAdmin &&
      referenceUid !== requestorDetails.uid
    ) {
      throw new ForbiddenException();
    }
    participantsRequest.requesterEmailId = requestorDetails.email;
    if (
      participantsRequest.participantType ===
        ParticipantType.MEMBER.toString() &&
      !ParticipantRequestMemberSchema.safeParse(participantsRequest).success
    ) {
      throw new BadRequestException();
    }
    if (
      participantsRequest.participantType === ParticipantType.MEMBER.toString()
    ) {
      const { city, country, region } = participantsRequest.newData;
      if (city || country || region) {
        const result: any = await this.locationTransferService.fetchLocation(
          city,
          country,
          null,
          region,
          null
        );
        if (!result || !result?.location) {
          throw new BadRequestException('Invalid Location info');
        }
      }
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
          await this.participantsRequestService.processMemberEditRequest(
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
      this.logService.error('error', error);
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
