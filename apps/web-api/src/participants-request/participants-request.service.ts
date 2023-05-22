/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable } from '@nestjs/common';
import { ApprovalStatus, ParticipantType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { RedisService } from '../utils/redis/redis.service';
import { SlackService } from '../utils/slack/slack.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { getRandomId } from '../utils/helper/helper';
@Injectable()
export class ParticipantsRequestService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private awsService: AwsService,
    private redisService: RedisService,
    private slackService: SlackService,
    private forestAdminService: ForestAdminService
  ) {}

  async getAll(userQuery) {
    const filters = {};

    if (userQuery.participantType) {
      filters['participantType'] = { equals: userQuery.participantType };
    }

    if (userQuery.status) {
      filters['status'] = { equals: userQuery.status };
    }

    if (userQuery.uniqueIdentifier) {
      filters['uniqueIdentifier'] = { equals: userQuery.uniqueIdentifier };
    }

    if (userQuery.requestType && userQuery.requestType === 'edit') {
      filters['referenceUid'] = { not: null };
    }

    if (userQuery.requestType && userQuery.requestType === 'new') {
      filters['referenceUid'] = { equals: null };
    }

    if (userQuery.referenceUid) {
      filters['referenceUid'] = { equals: userQuery.referenceUid };
    }

    const results = await this.prisma.participantsRequest.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
    });
    return results;
  }

  async getByUid(uid) {
    const result = await this.prisma.participantsRequest.findUnique({
      where: { uid: uid },
    });
    return result;
  }

  async findDuplicates(uniqueIdentifier, participantType, uid, requestId) {
    let itemInRequest = await this.prisma.participantsRequest.findMany({
      where: {
        participantType,
        status: ApprovalStatus.PENDING,
        OR: [{ referenceUid: uid }, { uniqueIdentifier }],
      },
    });
    itemInRequest = itemInRequest?.filter((item) => item.uid !== requestId);
    if (itemInRequest.length === 0) {
      if (participantType === 'TEAM') {
        let teamResult = await this.prisma.team.findMany({
          where: {
            name: uniqueIdentifier,
          },
        });
        teamResult = teamResult?.filter((item) => item.uid !== uid);
        if (teamResult.length > 0) {
          return { isRequestPending: false, isUniqueIdentifierExist: true };
        } else {
          return { isRequestPending: false, isUniqueIdentifierExist: false };
        }
      } else {
        let memResult = await this.prisma.member.findMany({
          where: {
            email: uniqueIdentifier,
          },
        });
        memResult = memResult?.filter((item) => item.uid !== uid);
        if (memResult.length > 0) {
          return { isRequestPending: false, isUniqueIdentifierExist: true };
        } else {
          return { isRequestPending: false, isUniqueIdentifierExist: false };
        }
      }
    } else {
      return { isRequestPending: true };
    }
  }

  async addRequest(requestData) {
    const uniqueIdentifier =
      requestData.participantType === 'TEAM'
        ? requestData.newData.name
        : requestData.newData.email;
    const postData = { ...requestData, uniqueIdentifier };
    requestData[uniqueIdentifier] = uniqueIdentifier;

    const slackConfig = {
      requestLabel: '',
      url: '',
      name: requestData.newData.name,
    };
    const result: any = await this.prisma.participantsRequest.create({
      data: { ...postData },
    });
    if (
      result.participantType === ParticipantType.MEMBER.toString() &&
      result.referenceUid === null
    ) {
      slackConfig.requestLabel = 'New Labber Request';
      slackConfig.url = `${process.env.WEB_ADMIN_UI_BASE_URL}/member-view?id=${result.uid}`;
      await this.awsService.sendEmail('NewMemberRequest', true, [], {
        memberName: result.newData.name,
        requestUid: result.uid,
        adminSiteUrl: `${process.env.WEB_ADMIN_UI_BASE_URL}/member-view?id=${result.uid}`,
      });
    } else if (
      result.participantType === ParticipantType.MEMBER.toString() &&
      result.referenceUid !== null
    ) {
      slackConfig.requestLabel = 'Edit Labber Request';
      slackConfig.url = `${process.env.WEB_ADMIN_UI_BASE_URL}/member-view?id=${result.uid}`;
      await this.awsService.sendEmail('EditMemberRequest', true, [], {
        memberName: result.newData.name,
        requestUid: result.uid,
        requesterEmailId: requestData.requesterEmailId,
        adminSiteUrl: `${process.env.WEB_ADMIN_UI_BASE_URL}/member-view?id=${result.uid}`,
      });
    } else if (
      result.participantType === ParticipantType.TEAM.toString() &&
      result.referenceUid === null
    ) {
      slackConfig.requestLabel = 'New Team Request';
      slackConfig.url = `${process.env.WEB_ADMIN_UI_BASE_URL}/team-view?id=${result.uid}`;
      await this.awsService.sendEmail('NewTeamRequest', true, [], {
        teamName: result.newData.name,
        requestUid: result.uid,
        adminSiteUrl: `${process.env.WEB_ADMIN_UI_BASE_URL}/team-view?id=${result.uid}`,
      });
    } else if (
      result.participantType === ParticipantType.TEAM.toString() &&
      result.referenceUid !== null
    ) {
      slackConfig.requestLabel = 'Edit Team Request';
      slackConfig.url = `${process.env.WEB_ADMIN_UI_BASE_URL}/team-view?id=${result.uid}`;
      await this.awsService.sendEmail('EditTeamRequest', true, [], {
        teamName: result.newData.name,
        teamUid: result.referenceUid,
        requesterEmailId: requestData.requesterEmailId,
        adminSiteUrl: `${process.env.WEB_ADMIN_UI_BASE_URL}/team-view?id=${result.uid}`,
      });
    }

    await this.slackService.notifyToChannel(slackConfig);
    await this.redisService.resetAllCache();
    return result;
  }

  async updateRequest(newData, requestedUid) {
    const formattedData = { ...newData };

    // remove id and Uid if present
    delete formattedData.id;
    delete formattedData.uid;
    delete formattedData.status;
    delete formattedData.participantType;
    await this.prisma.participantsRequest.update({
      where: { uid: requestedUid },
      data: { ...formattedData },
    });
    await this.redisService.resetAllCache();
    return { code: 1, message: 'success' };
  }

  async processRejectRequest(uidToReject) {
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToReject },
    });
    if (dataFromDB.status !== ApprovalStatus.PENDING.toString()) {
      return { code: -1, message: 'Request already Processed' };
    }
    await this.prisma.participantsRequest.update({
      where: { uid: uidToReject },
      data: { status: ApprovalStatus.REJECTED },
    });
    await this.redisService.resetAllCache();
    return { code: 1, message: 'Success' };
  }

  async processMemberCreateRequest(uidToApprove) {
    // Get
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToApprove },
    });

    if (dataFromDB.status !== ApprovalStatus.PENDING.toString()) {
      return { code: -1, message: 'Request already Processed' };
    }
    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};
    const slackConfig = {
      requestLabel: '',
      url: '',
      name: dataToProcess.name,
    };
    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['email'] = dataToProcess.email;

    // Optional fields
    dataToSave['githubHandler'] = dataToProcess.githubHandler;
    dataToSave['discordHandler'] = dataToProcess.discordHandler;
    dataToSave['twitterHandler'] = dataToProcess.twitterHandler;
    dataToSave['linkedinHandler'] = dataToProcess.linkedinHandler;
    dataToSave['officeHours'] = dataToProcess.officeHours;
    dataToSave['moreDetails'] = dataToProcess.moreDetails;
    dataToSave['plnStartDate'] = dataToProcess.plnStartDate;
    dataToSave['openToWork'] = dataToProcess.openToWork;

    // Team member roles relational mapping
    dataToSave['teamMemberRoles'] = {
      createMany: {
        data: dataToProcess.teamAndRoles.map((t) => {
          return {
            role: t.role,
            mainTeam: false,
            teamLead: false,
            teamUid: t.teamUid,
          };
        }),
      },
    };

    // Skills relation mapping
    dataToSave['skills'] = {
      connect: dataToProcess.skills.map((s) => {
        return { uid: s.uid };
      }),
    };

    // Image Mapping
    if (dataToProcess.imageUid) {
      dataToSave['image'] = { connect: { uid: dataToProcess.imageUid } };
    }

    // Unique Location Uid needs to be formulated based on city, country & region using google places api and mapped to member
    const { city, country, region } = dataToProcess;
    if (city || country || region) {
      const result: any = await this.locationTransferService.fetchLocation(
        city,
        country,
        null,
        region,
        null
      );
      if (result && result?.location?.placeId) {
        const finalLocation: any = await this.prisma.location.upsert({
          where: { placeId: result?.location?.placeId },
          update: result?.location,
          create: result?.location,
        });
        if (finalLocation && finalLocation.uid) {
          dataToSave['location'] = { connect: { uid: finalLocation.uid } };
        }
      } else {
        throw new BadRequestException('Invalid Location info');
      }
    }

    // Insert member details
    const newMember = await this.prisma.member.create({
      data: { ...dataToSave },
    });
    await this.prisma.participantsRequest.update({
      where: { uid: uidToApprove },
      data: { status: ApprovalStatus.APPROVED },
    });
    await this.awsService.sendEmail('MemberCreated', true, [], {
      memberName: dataToProcess.name,
      memberUid: newMember.uid,
      adminSiteUrl: `${process.env.WEB_UI_BASE_URL}/members/${
        newMember.uid
      }?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`,
    });
    await this.awsService.sendEmail(
      'NewMemberSuccess',
      false,
      [dataFromDB.requesterEmailId],
      {
        memberName: dataToProcess.name,
        memberProfileLink: `${process.env.WEB_UI_BASE_URL}/members/${
          newMember.uid
        }?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`,
      }
    );
    slackConfig.requestLabel = 'New Labber Added';
    slackConfig.url = `${process.env.WEB_UI_BASE_URL}/members/${
      newMember.uid
    }?utm_source=notification&utm_medium=slack&utm_code=${getRandomId()}`;
    await this.slackService.notifyToChannel(slackConfig);
    await this.redisService.resetAllCache();
    await this.forestAdminService.triggerAirtableSync();
    return { code: 1, message: 'Success' };
  }

  async processMemberEditRequest(uidToEdit) {
    // Get
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToEdit },
    });
    if (dataFromDB.status !== ApprovalStatus.PENDING.toString()) {
      return { code: -1, message: 'Request already Processed' };
    }

    const existingData: any = await this.prisma.member.findUnique({
      where: { uid: dataFromDB.referenceUid },
      include: {
        image: true,
        location: true,
        skills: true,
        teamMemberRoles: true,
      },
    });
    const dataToProcess = dataFromDB?.newData;
    const dataToSave: any = {};
    const slackConfig = {
      requestLabel: '',
      url: '',
      name: dataToProcess.name,
    };

    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['email'] = dataToProcess.email;

    // Optional fields
    dataToSave['githubHandler'] = dataToProcess.githubHandler;
    dataToSave['discordHandler'] = dataToProcess.discordHandler;
    dataToSave['twitterHandler'] = dataToProcess.twitterHandler;
    dataToSave['linkedinHandler'] = dataToProcess.linkedinHandler;
    dataToSave['officeHours'] = dataToProcess.officeHours;
    dataToSave['moreDetails'] = dataToProcess.moreDetails;
    dataToSave['plnStartDate'] = dataToProcess.plnStartDate;
    dataToSave['openToWork'] = dataToProcess.openToWork;

    // Skills relation mapping
    dataToSave['skills'] = {
      set: dataToProcess.skills.map((s) => {
        return { uid: s.uid };
      }),
    };

    // Image Mapping
    if (existingData.image.uid !== dataToProcess.imageUid) {
      dataToSave['image'] = { connect: { uid: dataToProcess.imageUid } };
    }

    // Unique Location Uid needs to be formulated based on city, country & region using google places api and mapped to member
    const { city, country, region } = dataToProcess;
    if (city || country || region) {
      const result: any = await this.locationTransferService.fetchLocation(
        city,
        country,
        null,
        region,
        null
      );
      if (result && result?.location?.placeId) {
        const finalLocation: any = await this.prisma.location.upsert({
          where: { placeId: result?.location?.placeId },
          update: result?.location,
          create: result?.location,
        });
        if (
          finalLocation &&
          finalLocation.uid &&
          existingData?.location?.uid !== finalLocation.uid
        ) {
          dataToSave['location'] = { connect: { uid: finalLocation.uid } };
        }
      } else {
        throw new BadRequestException('Invalid Location info');
      }
    }

    // Team member roles relational mapping
    const oldTeamUids = [...existingData.teamMemberRoles].map((t) => t.teamUid);
    const newTeamUids = [...dataToProcess.teamAndRoles].map((t) => t.teamUid);
    const teamAndRolesUidsToDelete: any[] = [
      ...existingData.teamMemberRoles,
    ].filter((t) => !newTeamUids.includes(t.teamUid));
    const teamAndRolesUidsToUpdate = [...dataToProcess.teamAndRoles].filter(
      (t) => {
        if (oldTeamUids.includes(t.teamUid)) {
          const foundIndex = [...existingData.teamMemberRoles].findIndex(
            (v) => v.teamUid === t.teamUid
          );
          if (foundIndex > -1) {
            const foundValue = [...existingData.teamMemberRoles][foundIndex];
            if (foundValue.role !== t.role) {
              return true;
            }
          }
        }
        return false;
      }
    );

    const teamAndRolesUidsToCreate = [...dataToProcess.teamAndRoles].filter(
      (t) => !oldTeamUids.includes(t.teamUid)
    );

    // Updating All data using transation.
    await this.prisma.$transaction(async (tx) => {
      // team-member-role changes
      const promisesToDelete = teamAndRolesUidsToDelete.map((v) =>
        tx.teamMemberRole.delete({
          where: {
            memberUid_teamUid: {
              teamUid: v.teamUid,
              memberUid: dataFromDB.referenceUid,
            },
          },
        })
      );
      const promisesToUpdate = teamAndRolesUidsToUpdate.map((v) =>
        tx.teamMemberRole.update({
          where: {
            memberUid_teamUid: {
              teamUid: v.teamUid,
              memberUid: dataFromDB.referenceUid,
            },
          },
          data: { role: v.role },
        })
      );
      await Promise.all(promisesToDelete);
      await Promise.all(promisesToUpdate);
      await tx.teamMemberRole.createMany({
        data: teamAndRolesUidsToCreate.map((t) => {
          return {
            role: t.role,
            mainTeam: false,
            teamLead: false,
            teamUid: t.teamUid,
            memberUid: dataFromDB.referenceUid,
          };
        }),
      });

      // Other member Changes
      await tx.member.update({
        where: { uid: dataFromDB.referenceUid },
        data: { ...dataToSave },
      });

      // Updating status
      await tx.participantsRequest.update({
        where: { uid: uidToEdit },
        data: { status: ApprovalStatus.APPROVED },
      });
    });
    await this.awsService.sendEmail('MemberEditRequestCompleted', true, [], {
      memberName: dataToProcess.name,
    });
    await this.awsService.sendEmail(
      'EditMemberSuccess',
      false,
      [dataFromDB.requesterEmailId],
      {
        memberName: dataToProcess.name,
        memberProfileLink: `${process.env.WEB_UI_BASE_URL}/members/${
          dataFromDB.referenceUid
        }?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`,
      }
    );
    slackConfig.requestLabel = 'Edit Labber Request Completed';
    slackConfig.url = `${process.env.WEB_UI_BASE_URL}/members/${
      dataFromDB.referenceUid
    }?utm_source=notification&utm_medium=slack&utm_code=${getRandomId()}`;
    await this.slackService.notifyToChannel(slackConfig);
    await this.redisService.resetAllCache();
    await this.forestAdminService.triggerAirtableSync();
    return { code: 1, message: 'Success' };
  }

  async processTeamCreateRequest(uidToApprove) {
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToApprove },
    });
    if (dataFromDB.status !== ApprovalStatus.PENDING.toString()) {
      return { code: -1, message: 'Request already Processed' };
    }

    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};
    const slackConfig = {
      requestLabel: '',
      url: '',
      name: dataToProcess.name,
    };

    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['contactMethod'] = dataToProcess.contactMethod;
    dataToSave['website'] = dataToProcess.website;
    dataToSave['shortDescription'] = dataToProcess.shortDescription;
    dataToSave['longDescription'] = dataToProcess.longDescription;

    // Non Mandatory Fields
    dataToSave['twitterHandler'] = dataToProcess.twitterHandler;
    dataToSave['linkedinHandler'] = dataToProcess.linkedinHandler;
    dataToSave['airtableRecId'] = dataToProcess.airtableRecId;
    dataToSave['blog'] = dataToProcess.blog;
    dataToSave['officeHours'] = dataToProcess.officeHours;
    dataToSave['shortDescription'] = dataToProcess.shortDescription;
    dataToSave['longDescription'] = dataToProcess.longDescription;
    dataToSave['moreDetails'] = dataToProcess.moreDetails;

    // Funding Stage Mapping
    dataToSave['fundingStage'] = {
      connect: { uid: dataToProcess.fundingStage.uid },
    };

    // Industry Tag Mapping
    dataToSave['industryTags'] = {
      connect: dataToProcess.industryTags.map((i) => {
        return { uid: i.uid };
      }),
    };

    // Technologies Mapping
    if (dataToProcess.technologies && dataToProcess.technologies.length > 0) {
      dataToSave['technologies'] = {
        connect: dataToProcess.technologies.map((t) => {
          return { uid: t.uid };
        }),
      };
    }

    // Membership Sources Mapping
    dataToSave['membershipSources'] = {
      connect: dataToProcess.membershipSources.map((m) => {
        return { uid: m.uid };
      }),
    };

    // Logo image Mapping
    if (dataToProcess.logoUid) {
      dataToSave['logo'] = { connect: { uid: dataToProcess.logoUid } };
    }

    const newTeam = await this.prisma.team.create({ data: { ...dataToSave } });
    await this.prisma.participantsRequest.update({
      where: { uid: uidToApprove },
      data: { status: ApprovalStatus.APPROVED },
    });
    await this.awsService.sendEmail('TeamCreated', true, [], {
      teamName: dataToProcess.name,
      teamUid: newTeam.uid,
      adminSiteUrl: `${process.env.WEB_UI_BASE_URL}/teams/${
        newTeam.uid
      }?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`,
    });
    await this.awsService.sendEmail(
      'NewTeamSuccess',
      false,
      [dataFromDB.requesterEmailId],
      {
        teamName: dataToProcess.name,
        teamProfileLink: `${process.env.WEB_UI_BASE_URL}/teams/${
          newTeam.uid
        }?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`,
      }
    );
    slackConfig.requestLabel = 'New Team Added';
    slackConfig.url = `${process.env.WEB_UI_BASE_URL}/teams/${
      newTeam.uid
    }?utm_source=notification&utm_medium=slack&utm_code=${getRandomId()}`;
    await this.slackService.notifyToChannel(slackConfig);
    await this.redisService.resetAllCache();
    await this.forestAdminService.triggerAirtableSync();
    return { code: 1, message: 'Success' };
  }

  async processTeamEditRequest(uidToEdit) {
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToEdit },
    });
    if (dataFromDB.status !== ApprovalStatus.PENDING.toString()) {
      return { code: -1, message: 'Request already Processed' };
    }
    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};

    const slackConfig = {
      requestLabel: '',
      url: '',
      name: dataToProcess.name,
    };
    const existingData: any = await this.prisma.team.findUnique({
      where: { uid: dataFromDB.referenceUid },
      include: {
        fundingStage: true,
        industryTags: true,
        logo: true,
        membershipSources: true,
        technologies: true,
      },
    });

    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['contactMethod'] = dataToProcess.contactMethod;
    dataToSave['website'] = dataToProcess.website;
    dataToSave['shortDescription'] = dataToProcess.shortDescription;
    dataToSave['longDescription'] = dataToProcess.longDescription;

    // Non Mandatory Fields
    dataToSave['twitterHandler'] = dataToProcess.twitterHandler;
    dataToSave['linkedinHandler'] = dataToProcess.linkedinHandler;
    dataToSave['airtableRecId'] = dataToProcess.airtableRecId;
    dataToSave['blog'] = dataToProcess.blog;
    dataToSave['officeHours'] = dataToProcess.officeHours;
    dataToSave['shortDescription'] = dataToProcess.shortDescription;
    dataToSave['longDescription'] = dataToProcess.longDescription;
    dataToSave['moreDetails'] = dataToProcess.moreDetails;

    // Funding Stage Mapping
    dataToSave['fundingStage'] = {
      connect: { uid: dataToProcess.fundingStage.uid },
    };

    // Logo image Mapping
    if (dataToProcess.logoUid) {
      dataToSave['logo'] = { connect: { uid: dataToProcess.logoUid } };
    }

    // Industry Tag Mapping
    dataToSave['industryTags'] = {
      set: dataToProcess.industryTags.map((i) => {
        return { uid: i.uid };
      }),
    };

    // Technologies Mapping
    if (dataToProcess.technologies && dataToProcess.technologies.length > 0) {
      dataToSave['technologies'] = {
        set: dataToProcess.technologies.map((t) => {
          return { uid: t.uid };
        }),
      };
    }

    // Membership Sources Mapping
    dataToSave['membershipSources'] = {
      set: dataToProcess.membershipSources.map((m) => {
        return { uid: m.uid };
      }),
    };

    await this.prisma.$transaction(async (tx) => {
      // Update data
      await tx.team.update({
        where: { uid: dataFromDB.referenceUid },
        data: { ...dataToSave },
      });
      // Updating status
      await tx.participantsRequest.update({
        where: { uid: uidToEdit },
        data: { status: ApprovalStatus.APPROVED },
      });
    });
    await this.awsService.sendEmail('TeamEditRequestCompleted', true, [], {
      teamName: dataToProcess.name,
    });
    await this.awsService.sendEmail(
      'EditTeamSuccess',
      false,
      [dataFromDB.requesterEmailId],
      {
        teamName: dataToProcess.name,
        teamProfileLink: `${process.env.WEB_UI_BASE_URL}/teams/${
          existingData.uid
        }?utm_source=notification&utm_medium=email&utm_code=${getRandomId()}`,
      }
    );
    slackConfig.requestLabel = 'Edit Team Request Completed ';
    slackConfig.url = `${process.env.WEB_UI_BASE_URL}/teams/${
      existingData.uid
    }?utm_source=notification&utm_medium=slack&utm_code=${getRandomId()}`;
    await this.slackService.notifyToChannel(slackConfig);
    await this.redisService.resetAllCache();
    await this.forestAdminService.triggerAirtableSync();
    return { code: 1, message: 'Success' };
  }
}
