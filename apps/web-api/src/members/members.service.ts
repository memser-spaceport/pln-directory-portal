/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  CACHE_MANAGER,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Cache } from 'cache-manager';
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
import { EmailOtpService } from '../otp/email-otp.service';
import { AuthService } from '../auth/auth.service';
import { LogService } from '../shared/log.service';
import { DIRECTORYADMIN, DEFAULT_MEMBER_ROLES } from '../utils/constants';
@Injectable()
export class MembersService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private participantsRequestService: ParticipantsRequestService,
    private fileMigrationService: FileMigrationService,
    private emailOtpService: EmailOtpService,
    private authService: AuthService,
    private logger: LogService,
    @Inject(CACHE_MANAGER) private cacheService: Cache

  ) {}

  findAll(queryOptions: Prisma.MemberFindManyArgs) {
    return this.prisma.member.findMany(queryOptions);
  }

  /**
   * This method retrieves the default(Founder, CEO, CTO and COO) and user selected(memberRoles) role's count
   * @param defaultAndUserSelectedRoles An array of role name(default & user selected roles)
   * @param memberRef Array of member UID's
   *   - This member UID's are retrieved from Prisma ORM by applying standard query filters in member & team member role
   * @returns Array of role with count
   */
  private async getRoleCountForDefaultAndUserSelectedRoles(defaultAndUserSelectedRoles, memberRef) {
    try {
      return await this.prisma.$queryRaw`
      SELECT CAST(count(DISTINCT "memberUid") as INTEGER) AS count, role 
      FROM (
        SELECT unnest("roleTags") AS role, "memberUid" 
        FROM "TeamMemberRole"
      ) AS roles WHERE role IN (SELECT unnest(string_to_array(${defaultAndUserSelectedRoles?.toString()}, ','))) AND 
      "memberUid" IN (
        SELECT unnest(string_to_array(${memberRef?.toString()}, ','))
      ) GROUP BY role;
    `;
    } catch (error) {
      this.logger.error('Error while retrieving member role count for default and user selected roles. Error: ', error);
      return {
        statusCode: 500,
        message: 'Error while retrieving member role count for default and user selected roles'
      };
    }
  }

  /**
   * This method retrieves the non default and non user selected(memberRoles) role's count where user search term matches
   * @param defaultAndUserSelectedRoles An array of role name(default & user selected roles)
   * @param memberRef Array of member UID's
   *   - This member UID's are retrieved from Prisma ORM by applying standard query filters in member & team member role
   * @param searchTerm Search text extracted from query params
   * @returns Array of role with count
   */
  private async getRoleCountForExcludedAndNonSelectedRoles(defaultAndUserSelectedRoles, memberRef, searchTerm) {
    try {
      return await this.prisma.$queryRaw`
        SELECT CAST(count(DISTINCT "memberUid") as INTEGER) AS count, role 
        FROM (
          SELECT unnest("roleTags") AS role, "memberUid" 
          FROM "TeamMemberRole"
        ) AS roles WHERE role NOT IN (SELECT unnest(string_to_array(${defaultAndUserSelectedRoles?.toString()}, ','))) 
        AND "memberUid" IN (
          SELECT unnest(string_to_array(${memberRef?.toString()}, ','))
        ) 
        AND role ILIKE '%' || ${searchTerm} || '%' 
        GROUP BY role;
    `;
    } catch (error) {
      this.logger.error('Error while retrieving member role count for excluded and non selected roles. Error: ', error);
      return {
        statusCode: 500,
        message: 'Error while retrieving member role count for excluded and non selected roles'
      };
    }
  }

  /**
   * Retrieves the roles associated with members
   * @param queryOptions 
   * @returns 
   */
  async getRolesWithCount(queryOptions: Prisma.MemberFindManyArgs, queryParams: any) {
    try {
      const memberRoles = queryParams?.memberRoles?.split(',') || [];
      const searchTerm = queryParams?.searchText || '';
      let members = await this.prisma.member.findMany({
        select: { uid: true },
        where: queryOptions.where,
      });
      members = members?.map((member: any) => member.uid);
      const selectedRoles = Array.from(new Set(Object.keys(DEFAULT_MEMBER_ROLES).concat(memberRoles)));
      const selectedRolesResult: any = await this.getRoleCountForDefaultAndUserSelectedRoles(selectedRoles, members);
      const formattedDefaultRoles: any = [];
      const references = selectedRolesResult.reduce((obj: any, value: any) => {
        obj[value.role] = value;
        return obj;
      }, {});
      selectedRoles.forEach((role: string) => {
        const filtered = references[role];
        const defaultRole = DEFAULT_MEMBER_ROLES[role];
        if (filtered && defaultRole) {
          formattedDefaultRoles.push({ ...defaultRole, ...filtered });
        } else if (filtered && !defaultRole) {
          formattedDefaultRoles.push({ ...filtered });
        } else if (!filtered && defaultRole) {
          formattedDefaultRoles.push({ ...defaultRole, count: 0 });
        }
      });
      const result: any = await this.getRoleCountForExcludedAndNonSelectedRoles(selectedRoles, members, searchTerm);
      return [...formattedDefaultRoles, ...result];
    } catch (error) {
      this.logger.error('Error while retrieving member role filters with count. Error: ', error);
      return {
        statusCode: 500,
        message: 'Error while retrieving member role filters with count'
      };
    }
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.MemberFindUniqueArgsBase, 'where'> = {},
    tx?: Prisma.TransactionClient
  ) {
    return (tx || this.prisma).member.findUniqueOrThrow({
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
        projectContributions: {
          include: {
            project: {
              include:{
                logo: true
              }
            }
          }
        }
      },
    });
  }

  async findMemberByEmail(emailId) {
    return await this.prisma.member.findUnique({
      where: { email: emailId.toLowerCase().trim() },
      include: {
        image: true,
        memberRoles: true,
        teamMemberRoles: true,
        projectContributions: true
      },
    });
  }

  async findMemberByExternalId(externalId) {
    return await this.prisma.member.findUnique({
      where: { externalId: externalId },
      include: {
        image: true,
        memberRoles: true,
        teamMemberRoles: true,
        projectContributions: true
      },
    });
  }


  async sendOtpForEmailChange(newEmailId, oldEmailId) {
    if (newEmailId.toLowerCase().trim() === oldEmailId.toLowerCase().trim()) {
      throw new BadRequestException('New email cannot be same as old email');
    }

    let isMemberAvailable = await this.isMemberExistForEmailId(oldEmailId);
    if (!isMemberAvailable) {
      throw new ForbiddenException('Your email seems to have been updated recently. Please login and try again');
    }

    isMemberAvailable = await this.isMemberExistForEmailId(newEmailId);
    if (isMemberAvailable) {
      throw new BadRequestException('Above email id is already used. Please try again with different email id.');
    }
     return await this.emailOtpService.sendEmailOtp(newEmailId);
  }

  async updateMemberEmail(newEmail, oldEmail) {
    const memberInfo = await this.findMemberByEmail(oldEmail);
    if(!memberInfo || !memberInfo.externalId) {
      throw new ForbiddenException("Please login again and try")
    }

    let newTokens;
    let newMemberInfo;

    await this.prisma.$transaction(async (tx) => {
      await this.participantsRequestService.addAutoApprovalEntry(tx, {
        status: 'AUTOAPPROVED',
        requesterEmailId: oldEmail,
        referenceUid: memberInfo.uid,
        uniqueIdentifier: oldEmail,
        participantType: 'MEMBER',
        newData: { oldEmail: oldEmail, newEmail: newEmail }
      })

      newMemberInfo = await tx.member.update({
          where: {email: oldEmail.toLowerCase().trim()},
          data: {email: newEmail.toLowerCase().trim()},
          include: {
            memberRoles: true,
            image: true,
            teamMemberRoles: true,
          }
        })
      newTokens = await this.authService.updateEmailInAuth(newEmail, oldEmail, memberInfo.externalId)
    })

    // Log Info
    this.logger.info(`Email has been successfully updated from ${oldEmail} to ${newEmail}`)
    await this.cacheService.reset();
    return {
      refreshToken: newTokens.refresh_token,
      idToken: newTokens.id_token,
      accessToken: newTokens.access_token,
      userInfo: this.memberToUserInfo(newMemberInfo)
    }
  }


  async isMemberExistForEmailId(emailId) {
    const member = await this.prisma.member.findUnique({
      where: { email: emailId.toLowerCase().trim() },
    });

    return member ? true : false;
  }
  private memberToUserInfo(memberInfo) {
    return {
      isFirstTimeLogin: memberInfo?.externalId ? false : true,
      name: memberInfo.name,
      email: memberInfo.email,
      profileImageUrl: memberInfo.image?.url,
      uid: memberInfo.uid,
      roles: memberInfo.memberRoles?.map((r) => r.name),
      leadingTeams: memberInfo.teamMemberRoles?.filter((role) => role.teamLead)
        .map(role => role.teamUid)
    };
  }


  async updateExternalIdByEmail(emailId, externalId) {
   return await this.prisma.member.update({
      where: { email: emailId.toLowerCase().trim() },
      data: { externalId: externalId },
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

  async getGitProjects(uid) {
    const member = await this.prisma.member.findUnique(
      {
        where: { uid: uid },
        select: { githubHandler: true }
      }
    );
    if (!member || !member.githubHandler) {
      return [];
    }
    try {
      const resp = await axios
        .post(
          'https://api.github.com/graphql',
          {
            query: `{
              user(login: "${member?.githubHandler}") {
                pinnedItems(first: 6, types: REPOSITORY) {
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
        );
      const response = await axios
        .get(`https://api.github.com/users/${member.githubHandler}/repos?sort=pushed&per_page=50`);
      const repositories = response?.data.map((item) => {
        return {
          name: item.name,
          description: item.description,
          url: item.html_url,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        };
      });
      if (resp?.data?.data?.user) {
        const { pinnedItems } = resp.data.data.user;
        if (pinnedItems?.nodes?.length > 0) {
          // Create a Set of pinned repository names for efficient lookup
          const pinnedRepositoryNames = new Set(pinnedItems.nodes.map((repo) => repo.name));
          // Filter out the pinned repositories from the list of all repositories
          const filteredRepositories = repositories?.filter((repo) => !pinnedRepositoryNames.has(repo.name));
          return [...pinnedItems.nodes, ...filteredRepositories].slice(0, 50);
        } else {
          return repositories || [];
        }
      }
    }
    catch(err) {
      this.logger.error('Error occured while fetching the git projects.', err);
      return {
        statusCode: 500,
        message: 'Internal Server Error.'
      };
    }
    return [];
  }

  async editMemberParticipantsRequest(participantsRequest, userEmail) {
    this.logger.info(`Member update request  - Processing with values - ${JSON.stringify(participantsRequest)}`)
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
          this.logger.info(`Member update request - Added entry in pariticipants request table, requestId -> ${result.uid}, requestor -> ${userEmail}`)
          await this.participantsRequestService.processMemberEditRequest(
            result.uid,
            true, // disable the notification
            true, // enable the auto approval
            requestorDetails.isDirectoryAdmin,
            tx
          );
          this.logger.info(`Member update request - completed, requestId -> ${result.uid}, requestor -> ${userEmail}`)
        } else {
          throw new InternalServerErrorException(`Error in updating member request`);
        }
      });
    } catch (error) {
      this.logger.info(`Member update request - error , requestor -> ${userEmail}, referenceId -> ${referenceUid}, error -> ${JSON.stringify(error)}`)
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

  findMemberFromEmail(email:string){
    return this.prisma.member.findUniqueOrThrow({
      where: { email: email.toLowerCase().trim() },
      include: {
        memberRoles: true,
      },
    });
  }

  async updatePreference(id,preference){
    const response = this.prisma.member.update(
      {
        where: {uid: id},
        data: {preferences: preference}
    }
    );
    this.cacheService.reset();
    return response;
  }

  async updateMember(uid, member) {
    const response = this.prisma.member.update(
      {
        where: { uid },
        data: { ...member }
    }
    );
    this.cacheService.reset();
    return response;
  }

  async getPreferences(uid) {
    const resp:any = await this.prisma.member.findUnique(
      {
        where: { uid: uid },
        select: {
          email: true,
          githubHandler: true,
          telegramHandler:true,
          discordHandler: true,
          linkedinHandler: true,
          twitterHandler: true,
          preferences: true,
        }
      }
    );
    const preferences = {...resp.preferences};
    if (!resp.preferences) {
      preferences.isnull = true;
    } else{
      preferences.isnull = false;
    }
    preferences.email = resp?.email ? true: false;
    preferences.github = resp?.githubHandler ? true: false;
    preferences.telegram = resp?.telegramHandler ? true: false;
    preferences.discord = resp?.discordHandler ? true: false;
    preferences.linkedin = resp?.linkedinHandler ? true : false;
    preferences.twitter = resp?.twitterHandler ? true: false;
    return preferences;
  }

  async isMemberLeadTeam(member, teamUid) {
    const user = await this.memberToUserInfo(member);
    if (user.leadingTeams.includes(teamUid)) {
      return true;
    }
    return false;
  }

  checkIfAdminUser = (member) => {
    const roleFilter = member.memberRoles.filter((roles) => {
      return roles.name === DIRECTORYADMIN;
    });
    return roleFilter.length > 0;
  };

  async isMemberPartOfTeams(member, teams) {
    return member.teamMemberRoles.some((role) => {
      return teams.includes(role.teamUid)
    });
  }

  /**
   * This method constructs a dynamic filter query for retrieving recent members
   * created within a specified number of days, based on the 'recent' query parameter
   * and an environment variable to configure the timeline.
   * 
   * @param queryParams - HTTP request query parameters object
   * @returns Constructed query with a 'createdAt' filter if 'recent' is set to 'true',
   *          or an empty object if 'recent' is not provided or set to 'false'.
   */
  buildRecentMembersFilter(queryParams) { 
    const { isRecent } = queryParams;
    if (isRecent === 'true') {
      return {
        createdAt: {
          gte: new Date(Date.now() - (parseInt(process.env.RECENT_RECORD_DURATION_IN_DAYS || '30') * 24 * 60 * 60 * 1000))
        }
      };
    }
    return {};
  }

  /**
   * This method construct the dynamic query to search either by roleTags or
   * by role name from the teamMemberRole table from query params
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given member role input
   */
  buildRoleFilters(queryParams) {
    const { memberRoles } : any = queryParams;
    const roles = memberRoles?.split(',');
    if (roles?.length > 0) {
      return {
        teamMemberRoles: {
          some: {
            roleTags: { hasSome: roles }
          }
        }
      };
    }
    return {};
  }

  /**
   * This method construct the dynamic query to search the given text in either
   * by member name or by team name from query params
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given text(name) input
   */
  buildNameFilters(queryParams) {
    const { name__icontains } = queryParams;
    if (name__icontains) {
      return {
        OR: [
          { name: {
              contains: name__icontains,
              mode: 'insensitive'
            }
          },
          { teamMemberRoles : {
              some: {
                team: {  
                  name: {
                    contains: name__icontains,
                    mode: 'insensitive'
                  } 
                } 
              }      
            }
          },
          { 
            projectContributions : {
              some: {
                project: {  
                  name: {
                    contains: name__icontains,
                    mode: 'insensitive'
                  },
                  isDeleted: false 
                } 
              }      
            }
          }
        ]
      }
    }
    return { };
  }

    /**
   * This method construct the dynamic query to search the member by 
   * their participation type i.e isHost only, isSpeaker only, or both host and speaker
   * @param queryParams HTTP request query params object
   * @returns Constructed query based on given participation type
   */
    buildParticipationTypeFilter(queryParams) {
      const isHost = queryParams.isHost === 'true';
      const isSpeaker = queryParams.isSpeaker === 'true';
      if (isHost || isSpeaker) {
        return {
          eventGuests:{
            some:{
              isHost: isHost,
              isSpeaker: isSpeaker,
            }
            }
        }
      }
      return { };
    }

  async updateTelegramIfChanged(member, telegram, tx?:Prisma.TransactionClient) {
    if (member.telegramHandler != telegram) {
      member = await (tx || this.prisma).member.update({
        where: { uid: member.uid },
        data: {
          telegramHandler: telegram
        }
      });
    }
    return member;
  }

  async updateOfficeHoursIfChanged(member, officeHours, tx?:Prisma.TransactionClient) {
    if (member.officeHours != officeHours) {
      member = await (tx || this.prisma).member.update({
        where: { uid: member.uid },
        data: {
          officeHours
        }
      });
    }
    return member;
  }
}
