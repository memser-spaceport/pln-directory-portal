/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { ApprovalStatus, ParticipantType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';

@Injectable()
export class ParticipantsRequestService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService: LocationTransferService,
    private awsService: AwsService
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
    });
    return results;
  }

  async getByUid(uid) {
    const result = await this.prisma.participantsRequest.findUnique({
      where: { uid: uid },
    });
    return result;
  }

  async findDuplicates(uniqueIdentifier, participantType) {
    console.log('in duplicates', participantType);

    const itemInRequest = await this.prisma.participantsRequest.findMany({
      where: {
        AND: {
          uniqueIdentifier: uniqueIdentifier,
          status: ApprovalStatus.PENDING,
        },
      },
    });
    if (itemInRequest.length === 0) {
      if (participantType === 'TEAM') {
        console.log(uniqueIdentifier);
        const teamResult = await this.prisma.team.findMany({
          where: { name: uniqueIdentifier },
        });
        return teamResult;
      } else {
        const memResult = await this.prisma.member.findMany({
          where: { email: uniqueIdentifier },
        });
        return memResult;
      }
    } else {
      return itemInRequest;
    }
  }

  async addRequest(requestData) {
    const uniqueIdentifier =
      requestData.participantType === 'TEAM'
        ? requestData.newData.name
        : requestData.newData.email;
    const postData = { ...requestData, uniqueIdentifier };
    requestData[uniqueIdentifier] = uniqueIdentifier;

    const result: any = await this.prisma.participantsRequest.create({
      data: { ...postData },
    });
    if (
      result.participantType === ParticipantType.MEMBER.toString() &&
      result.referenceUid === null
    ) {
      await this.awsService.sendEmail(
        'NewMemberRequest',
        ['thangaraj.esakky@ideas2it.com'],
        {
          memberName: result.newData.name,
          requestUid: result.uid,
          adminSiteUrl: 'https://www.google/com',
        }
      );
    } else if (
      result.participantType === ParticipantType.MEMBER.toString() &&
      result.referenceUid !== null
    ) {
      await this.awsService.sendEmail(
        'EditMemberRequest',
        ['thangaraj.esakky@ideas2it.com'],
        {
          memberName: result.newData.name,
          requestUid: result.uid,
          requesterEmailId: requestData.editRequestorEmailId,
          adminSiteUrl: 'https://www.google/com',
        }
      );
    } else if (
      result.participantType === ParticipantType.TEAM.toString() &&
      result.referenceUid === null
    ) {
      await this.awsService.sendEmail(
        'NewTeamRequest',
        ['thangaraj.esakky@ideas2it.com'],
        {
          teamName: result.newData.name,
          requestUid: result.uid,
          adminSiteUrl: 'https://www.google/com',
        }
      );
    } else if (
      result.participantType === ParticipantType.TEAM.toString() &&
      result.referenceUid !== null
    ) {
      await this.awsService.sendEmail(
        'EditTeamRequest',
        ['thangaraj.esakky@ideas2it.com'],
        {
          teamName: result.newData.name,
          requesterEmailId: requestData.editRequestorEmailId,
          adminSiteUrl: 'https://www.google/com',
        }
      );
    }

    console.log('sent email and added record', requestData);
    return result;
  }

  async updateRequest(newData, requestedUid) {
    const formattedData = { ...newData };

    // remove id and Uid if present
    delete formattedData.id;
    delete formattedData.uid;
    delete formattedData.status;
    delete formattedData.participantType;
    console.log(formattedData, requestedUid);
    await this.prisma.participantsRequest.update({
      where: { uid: requestedUid },
      data: { ...formattedData },
    });
    return { code: 1, message: 'success' };
  }

  async processRejectRequest(uidToReject) {
    await this.prisma.participantsRequest.update({
      where: { uid: uidToReject },
      data: { status: ApprovalStatus.REJECTED },
    });
    return { code: 1, message: 'Success' };
  }

  async processMemberCreateRequest(uidToApprove) {
    // Get
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToApprove },
    });
    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};

    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['email'] = dataToProcess.email;

    // Optinal field
    if (dataToProcess.githubHandler) {
      dataToProcess['githubHandler'] = dataToProcess.githubHandler;
    }
    if (dataToProcess.discordHandler) {
      dataToProcess['discordHandler'] = dataToProcess.discordHandler;
    }
    if (dataToProcess.twitterHandler) {
      dataToProcess['twitterHandler'] = dataToProcess.twitterHandler;
    }
    if (dataToProcess.linkedinHandler) {
      dataToProcess['linkedinHandler'] = dataToProcess.linkedinHandler;
    }
    if (dataToProcess.officeHours) {
      dataToProcess['officeHours'] = dataToProcess.officeHours;
    }
    if (dataToProcess.moreDetails) {
      dataToProcess['moreDetails'] = dataToProcess.moreDetails;
    }
    if (dataToProcess.locationUid) {
      dataToProcess['locationUid'] = dataToProcess.locationUid;
    }
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
      dataToSave['image'] = {
        connect: { uid: dataToProcess.imageUid },
      };
    }
    // Unique Location Uid needs to be formulated based on city, country & region using google places api and mapped to member
    const { city, country, region } = dataToProcess;
    const result: any = await this.locationTransferService.fetchLocation(
      city,
      country,
      null,
      region,
      null
    );
    const finalLocation: any = await this.prisma.location.upsert({
      where: { placeId: result?.location?.placeId },
      update: result?.location,
      create: result?.location,
    });
    if (finalLocation && finalLocation.uid) {
      dataToSave['location'] = { connect: { uid: finalLocation.uid } };
    }

    // Insert member details
    const newMember = await this.prisma.member.create({
      data: { ...dataToSave },
    });
    await this.prisma.participantsRequest.update({
      where: { uid: uidToApprove },
      data: { status: ApprovalStatus.APPROVED },
    });
    await this.awsService.sendEmail(
      'MemberCreated',
      ['thangaraj.esakky@ideas2it.com'],
      {
        memberName: dataToProcess.name,
        memberUid: newMember.uid,
        adminSiteUrl: 'https://www.google/com',
      }
    );
    return { code: 1, message: 'Success' };
  }

  async processMemberEditRequest(uidToEdit) {
    // Get
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToEdit },
    });
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

    console.log(existingData);

    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['email'] = dataToProcess.email;
    dataToSave['imageUid'] = dataToProcess.imageUid;

    // Optinal field
    if (dataToProcess.githubHandler) {
      dataToProcess['githubHandler'] = dataToProcess.githubHandler;
    }
    if (dataToProcess.discordHandler) {
      dataToProcess['discordHandler'] = dataToProcess.discordHandler;
    }
    if (dataToProcess.twitterHandler) {
      dataToProcess['twitterHandler'] = dataToProcess.twitterHandler;
    }
    if (dataToProcess.linkedinHandler) {
      dataToProcess['linkedinHandler'] = dataToProcess.linkedinHandler;
    }
    if (dataToProcess.officeHours) {
      dataToProcess['officeHours'] = dataToProcess.officeHours;
    }
    if (dataToProcess.moreDetails) {
      dataToProcess['moreDetails'] = dataToProcess.moreDetails;
    }
    if (dataToProcess.locationUid) {
      dataToProcess['locationUid'] = dataToProcess.locationUid;
    }

    // Team member roles relational mapping
    const oldTeamUids = [...existingData.teamMemberRoles].map((t) => t.teamUid);
    const newTeamUids = [...dataToProcess.teamAndRoles].map((t) => t.teamUid);

    const teamAndRolesUidsToDelete: any = [...existingData.teamMemberRoles]
      .filter((t) => !newTeamUids.includes(t.teamUid))
      .map((t) => t.teamUid);
    const teamAndRolesUidsToUpdate = [...existingData.teamMemberRoles]
      .filter((t) => newTeamUids.includes(t.teamUid))
      .map((t) => t.teamUid);
    const teamAndRolesUidsToCreate = [...dataToProcess.teamAndRoles]
      .filter((t) => !oldTeamUids.includes(t.teamUid))
      .map((t) => t.teamUid);

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
    await this.prisma.teamMemberRole.deleteMany({
      where: { id: { in: teamAndRolesUidsToDelete } },
    });
    // Skills relation mapping
    dataToSave['skills'] = {
      connect: dataToProcess.skills.map((s) => {
        return { uid: s.uid };
      }),
    };

    // Unique Location Uid needs to be formulated based on city, country & region using google places api and mapped to member
    const { city, country, region } = dataToProcess;

    /*  const result = await this.locationTransferService.fetchLocation(city, country, null, region, null);
      if (result.status !== 'NO_REQUIRED_PLACE') {
       const finalLocation = await this.prisma.location.upsert({
         where: {placeId: result?.location?.placeId},
         update:  result?.location ?? {},
         create: result?.location ?? {placeId: "",city: null,country: null,continent: null,region: null,metroArea: null,regionAbbreviation: null,latitude: null, longitude: null} 
       });
       if(finalLocation && finalLocation.uid) {
         dataToSave['location'] = {"connect": {"uid": finalLocation.uid}}
       }
      } */

    console.log(dataToSave);
    // Insert member details
    //  await this.prisma.member.create({data: {...dataToSave}})
    //await this.prisma.participantsRequest.update({where: {uid: uidToApprove}, data: {status: ApprovalStatus.APPROVED}})
    return { code: 1, message: 'Success' };
  }

  async processTeamCreateRequest(uidToApprove) {
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToApprove },
    });
    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};

    // Mandatory fields
    dataToSave['name'] = dataToProcess.name;
    dataToSave['contactMethod'] = dataToProcess.contactMethod;
    dataToSave['website'] = dataToProcess.website;
    dataToSave['shortDescription'] = dataToProcess.shortDescription;
    dataToSave['longDescription'] = dataToProcess.longDescription;

    // Non Mandatory Fields
    if (dataToProcess.twitterHandler) {
      dataToSave['twitterHandler'] = dataToProcess.twitterHandler;
    }
    if (dataToProcess.linkedinHandler) {
      dataToSave['linkedinHandler'] = dataToProcess.linkedinHandler;
    }
    if (dataToProcess.airtableRecId) {
      dataToSave['airtableRecId'] = dataToProcess.airtableRecId;
    }
    if (dataToProcess.blog) {
      dataToSave['blog'] = dataToProcess.blog;
    }
    if (dataToProcess.officeHours) {
      dataToSave['officeHours'] = dataToProcess.officeHours;
    }
    if (dataToProcess.shortDescription) {
      dataToSave['shortDescription'] = dataToProcess.shortDescription;
    }
    if (dataToProcess.longDescription) {
      dataToSave['longDescription'] = dataToProcess.longDescription;
    }
    if (dataToProcess.moreDetails) {
      dataToSave['moreDetails'] = dataToProcess.moreDetails;
    }

    // Funding Stage Mapping
    dataToSave['fundingStage'] = {
      connect: { uid: dataToProcess.fundingStageUid },
    };

    // Industry Tag Mapping
    dataToSave['industryTags'] = {
      connect: dataToProcess.industryTags.map((i) => {
        return { uid: i.uid };
      }),
    };

    // Technologies Mapping
    dataToSave['technologies'] = {
      connect: dataToProcess.technologies.map((t) => {
        return { uid: t.uid };
      }),
    };

    // Membership Sources Mapping
    dataToSave['membershipSources'] = {
      connect: dataToProcess.membershipSources.map((m) => {
        return { uid: m.uid };
      }),
    };

    // Membership Sources Mapping
    if (dataToProcess.logoUid) {
      dataToSave['logo'] = {
        connect: { uid: dataToProcess.logoUid },
      };
    }

    const newTeam = await this.prisma.team.create({ data: { ...dataToSave } });
    await this.prisma.participantsRequest.update({
      where: { uid: uidToApprove },
      data: { status: ApprovalStatus.APPROVED },
    });
    await this.awsService.sendEmail(
      'TeamCreated',
      ['thangaraj.esakky@ideas2it.com'],
      {
        teamName: dataToProcess.name,
        teamUid: newTeam.uid,
        adminSiteUrl: 'https://www.google/com',
      }
    );
    return { code: 1, message: 'Success' };
  }

  async processTeamEditRequest(uidToEdit) {
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToEdit },
    });
    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};
  }
}