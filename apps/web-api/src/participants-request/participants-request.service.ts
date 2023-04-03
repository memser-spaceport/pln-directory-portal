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
        ['thangaraj.esakky@ideas2it.com'],
        `New Labber request: ${result.newData.name}`,
        `<p>Hi Lachrista</p><p>${result.newData.name} has submitted a request to become a member of the PL Network Directory.</p> <p>For more information , please use the Member Reference ID ${result.uid}</p>`
      );
    } else if (
      result.participantType === ParticipantType.MEMBER.toString() &&
      result.referenceUid !== null
    ) {
      await this.awsService.sendEmail(
        ['thangaraj.esakky@ideas2it.com'],
        `Directory Team Member Edit Request`,
        `<p>Hi Lachrista</p><p>${result.newData.uniqueIdentifier} has requested an edit to ${result.newData.email} in the PLN Directory.</p>`
      );
    } else if (
      result.participantType === ParticipantType.TEAM.toString() &&
      result.referenceUid === null
    ) {
      await this.awsService.sendEmail(
        ['thangaraj.esakky@ideas2it.com'],
        `New Labber request: ${result.newData.name}`,
        `<p>Hi Lachrista</p><p>The team <New team Name> requested to be added onto the PL Network Directory.</p> <p>For more information , please use the Team Reference ID ${result.uid}</p>`
      );
    } else if (
      result.participantType === ParticipantType.MEMBER.toString() &&
      result.referenceUid !== null
    ) {
      await this.awsService.sendEmail(
        ['thangaraj.esakky@ideas2it.com'],
        `Directory Team Member Edit Request`,
        `<p>hi Lachrista</p><p>${result.newData.email} has requested an edit to ${result.newData.name} in the PLN Directory.</p>`
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
    dataToSave['plnFriend'] = dataToProcess.plnFriend;

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
    await this.prisma.member.create({ data: { ...dataToSave } });
    await this.prisma.participantsRequest.update({
      where: { uid: uidToApprove },
      data: { status: ApprovalStatus.APPROVED },
    });
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
    dataToSave['plnFriend'] = dataToProcess.plnFriend;

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
    console.log(
      dataToSave.fundingStage,
      dataToSave.industryTags,
      dataToSave.technologies,
      dataToSave.membershipSources
    );
    // Insert member details

    //await this.prisma.team.create({ data: { ...dataToSave, id: 301 } });
    await this.prisma.participantsRequest.update({
      where: { uid: uidToApprove },
      data: { status: ApprovalStatus.APPROVED },
    });

    // Send Email
  }

  async processTeamEditRequest(uidToEdit) {
    const dataFromDB: any = await this.prisma.participantsRequest.findUnique({
      where: { uid: uidToEdit },
    });
    const dataToProcess: any = dataFromDB.newData;
    const dataToSave: any = {};
  }
}
