/* eslint-disable prettier/prettier */
import { 
  BadRequestException, 
  ConflictException, 
  NotFoundException, 
  Inject, 
  Injectable, 
  CACHE_MANAGER, 
  forwardRef 
} from '@nestjs/common';
import { ApprovalStatus, ParticipantType } from '@prisma/client';
import { Cache } from 'cache-manager';
import { Prisma, ParticipantsRequest, PrismaClient } from '@prisma/client';
import { generateProfileURL } from '../utils/helper/helper';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { NotificationService } from '../utils/notification/notification.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';

@Injectable()
export class ParticipantsRequestService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private locationTransferService: LocationTransferService,
    private forestAdminService: ForestAdminService,
    private notificationService: NotificationService,
    @Inject(CACHE_MANAGER) 
    private cacheService: Cache,
    @Inject(forwardRef(() => MembersService))
    private membersService: MembersService,
    @Inject(forwardRef(() => TeamsService)) 
    private teamsService: TeamsService,
  ) {}

  /**
   * Find all participant requests based on the query.
   * Filters are dynamically applied based on the presence of query parameters.
   * 
   * @param userQuery - The query object containing filtering options like participantType, status, etc.
   * @returns A promise that resolves with the filtered participant requests
   */
  async getAll(userQuery): Promise<ParticipantsRequest[]> {
    try {
      const filters = {
        ...(userQuery.participantType && {
          participantType: { equals: userQuery.participantType },
        }),
        ...(userQuery.status && { status: { equals: userQuery.status } }),
        ...(userQuery.uniqueIdentifier && {
          uniqueIdentifier: { equals: userQuery.uniqueIdentifier }
        }),
        ...('edit' === userQuery.requestType && { referenceUid: { not: null } }),
        ...('new' === userQuery.requestType && { referenceUid: { equals: null } }),
        ...(userQuery.referenceUid && {
          referenceUid: { equals: userQuery.referenceUid }
        })
      };
      return await this.prisma.participantsRequest.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
      });
    } catch(err) {
      return this.handleErrors(err)
    }
  }

  /**
   * Add a new entry to the participants request table.
   * 
   * @param tx - The transactional Prisma client
   * @param newEntry - The data for the new participants request entry
   * @returns A promise that resolves with the newly created entry
   */
  async add(
    newEntry: Prisma.ParticipantsRequestUncheckedCreateInput,
    tx?: Prisma.TransactionClient, 
  ): Promise<ParticipantsRequest> {
    try {
      return await (tx || this.prisma).participantsRequest.create({
        data: { ...newEntry },
      });
    } catch(err) {
      return this.handleErrors(err)
    }
  }

  /**
   * Find a single entry from the participants request table that matches the provided UID.
   * 
   * @param uid - The UID of the participants request entry to be fetched
   * @returns A promise that resolves with the matching entry or null if not found
   */
  async findOneByUid(uid: string): Promise<ParticipantsRequest | null> {
    try {
      return await this.prisma.participantsRequest.findUnique({
        where: { uid },
      });
    } catch(err) {
      return this.handleErrors(err, uid)
    }
  }

  /**
   * Check if any entry exists in the participants-request table and the members/teams table
   * for the given identifier.
   *
   * @param type - The participant type (either TEAM or MEMBER)
   * @param identifier - The unique identifier (team name or member email)
   * @returns A promise that resolves with an object containing flags indicating whether a request is pending and whether the identifier exists
   */
  async checkIfIdentifierAlreadyExist(
    type: ParticipantType,
    identifier: string
  ): Promise<{ 
    isRequestPending: boolean; 
    isUniqueIdentifierExist: boolean 
  }> {
    try {
      const existingRequest = await this.prisma.participantsRequest.findFirst({
        where: {
          status: ApprovalStatus.PENDING,
          participantType: type,
          uniqueIdentifier: identifier,
        },
      });
      if (existingRequest) {
        return { isRequestPending: true, isUniqueIdentifierExist: false };
      }
      const existingEntry = 
        type === ParticipantType.TEAM 
          ? await this.teamsService.findTeamByName(identifier) 
          : await this.membersService.findMemberByEmail(identifier);
      if (existingEntry) {
        return { isRequestPending: false, isUniqueIdentifierExist: true };
      }
      return { isRequestPending: false, isUniqueIdentifierExist: false };
    } 
    catch(err) {
      return this.handleErrors(err)
    }
  }

  /**
   * Update a participants request entry by UID.
   * The function will omit specific fields (like uid, id, status, participantType) from being updated.
   *
   * @param participantRequest - The updated data for the participants request
   * @param requestedUid - The UID of the participants request to update
   * @returns A success response after updating the request
   */
  async updateByUid(
    uid: string,
    participantRequest: Prisma.ParticipantsRequestUncheckedUpdateInput,
  ):Promise<ParticipantsRequest> {
    try {
      const formattedData = { ...participantRequest };
      delete formattedData.id;
      delete formattedData.uid;
      delete formattedData.status;
      delete formattedData.participantType;
      const result:ParticipantsRequest = await this.prisma.participantsRequest.update({
        where: { uid },
        data: formattedData,
      });
      await this.cacheService.reset();
      return result;
    } catch(err) {
      return this.handleErrors(err)
    }
  }

  /**
   * Process a reject operation on a pending participants request.
   * If the request is not in a pending state, an exception is thrown.
   *
   * @param uidToReject - The UID of the participants request to reject
   * @returns A success response after rejecting the request
   * @throws BadRequestException if the request is already processed
   */
  async rejectRequestByUid(uidToReject: string): Promise<ParticipantsRequest> {
    try {
      const result:ParticipantsRequest = await this.prisma.participantsRequest.update({
        where: { uid: uidToReject },
        data: { status: ApprovalStatus.REJECTED }
      });
      await this.cacheService.reset();
      return result;
    } catch(err) {
      return this.handleErrors(err)
    }
  }

  /**
   * Approves a participant request by UID, creating either a new member or a team based on the request type.
   * 
   * 1. Validates and processes the new data in the participant request (either MEMBER or TEAM).
   * 2. Uses a transaction to:
   *    - Create a new member or team based on the `participantType`.
   *    - Update the participant request status to `APPROVED`.
   * 3. Sends a notification based on the type of participant (member or team) after creation.
   * 4. Resets the cache and triggers an Airtable synchronization.
   * 
   * @param uidToApprove - The unique identifier of the participant request to approve.
   * @param participantsRequest - The participant request data containing details of the request.
   * @returns The updated participant request with the status set to `APPROVED`.
   */
  private async approveRequestByUid(
    uidToApprove: string, 
    participantsRequest: ParticipantsRequest
  ): Promise<ParticipantsRequest> {
    let result;
    let createdItem;
    const dataToProcess: any = participantsRequest;
    const participantType = participantsRequest.participantType;
    // Add new member or team and update status to approved
    await this.prisma.$transaction(async (tx) => {
      if (participantType === 'MEMBER') {
        dataToProcess.requesterEmailId = dataToProcess.newData.email.toLowerCase().trim();
        createdItem = await this.membersService.createMemberFromParticipantsRequest(
          dataToProcess,
          tx
        );
      } else {
        createdItem = await this.teamsService.createTeamFromParticipantsRequest(
          dataToProcess,
          tx
        );
      }
      result = await tx.participantsRequest.update({
        where: { uid: uidToApprove },
        data: { status: ApprovalStatus.APPROVED },
      });
    });
    if (participantType === 'MEMBER') {
      await this.notificationService.notifyForMemberCreationApproval(
        createdItem.name,
        createdItem.uid,
        dataToProcess.requesterEmailId
      );
    } else {
      await this.notificationService.notifyForTeamCreationApproval(
        createdItem.name,
        createdItem.uid,
        participantsRequest.requesterEmailId
      );
    }
    await this.cacheService.reset();
    await this.forestAdminService.triggerAirtableSync();
    return result;
  }

  /**
   * Approve/Reject request in participants-request table.
   * @param statusToProcess
   * @param uid
   * @returns
   */
  async processRequestByUid(uid:string, participantsRequest:ParticipantsRequest, statusToProcess) {
    if (statusToProcess === ApprovalStatus.REJECTED) {
      return await this.rejectRequestByUid(uid);
    } else {
      return await this.approveRequestByUid(uid, participantsRequest);
    }
  }

  /**
   * Adds a new participants request.
   * Validates the request data, checks for duplicate identifiers,
   * and optionally sends notifications upon successful creation.
   *
   * @param {Prisma.ParticipantsRequestUncheckedCreateInput} requestData - The request data for adding a new participant.
   * @param {boolean} [disableNotification=false] - Flag to disable notification sending.
   * @param {Prisma.TransactionClient | PrismaClient} [tx=this.prisma] - Database transaction or client.
   * @returns {Promise<ParticipantsRequest>} - The newly created participant request.
   * @throws {BadRequestException} - If validation fails or unique identifier already exists.
   */
  async addRequest(
    requestData: Prisma.ParticipantsRequestUncheckedCreateInput,
    disableNotification: boolean = false,
    tx: Prisma.TransactionClient | PrismaClient = this.prisma
  ): Promise<ParticipantsRequest> {
    const uniqueIdentifier = this.getUniqueIdentifier(requestData);
    const postData = { ...requestData, uniqueIdentifier };
    // Add the new request
    const result: ParticipantsRequest = await this.add({
      ...postData
      }, 
      tx
    );
    if (!disableNotification) {
      this.notifyForCreate(result);
    }
    await this.cacheService.reset();
    return result;
  }

  /**
   * Validates the location information for a participant if provided.
   *
   * @param data - The participant data containing location details (city, country, region).
   * @throws {BadRequestException} - If the location data is invalid.
   */
  async validateLocation(data: any): Promise<void> {
    const { city, country, region } = data;
    if (city || country || region) {
      const result: any = await this.locationTransferService.fetchLocation(city, country, null, region, null);
      if (!result || !result?.location) {
        throw new BadRequestException('Invalid Location info');
      }
    }
  }
  
  /**
   * Extract unique identifier based on participant type.
   * @param requestData 
   * @returns string
   */
  getUniqueIdentifier(requestData): string {
    return requestData.participantType === 'TEAM'
      ? requestData.newData.name
      : requestData.newData.email?.toLowerCase().trim();
  }
  
  /**
   * Validate if the unique identifier already exists.
   * @param participantType 
   * @param uniqueIdentifier 
   * @throws BadRequestException if identifier already exists
   */
  async validateUniqueIdentifier(
    participantType: ParticipantType, 
    uniqueIdentifier: string
  ): Promise<void> {
    const { isRequestPending, isUniqueIdentifierExist } = await this.checkIfIdentifierAlreadyExist(
      participantType,
      uniqueIdentifier
    );
    if (isRequestPending || isUniqueIdentifierExist) {
      const typeLabel = participantType === 'TEAM' ? 'Team name' : 'Member email';
      throw new BadRequestException(`${typeLabel} already exists`);
    }
  }
  
  /**
   * Validate location for members or email for teams.
   * @param requestData 
   * @throws BadRequestException if validation fails
   */
  async validateParticipantRequest(requestData: any): Promise<void> {
    if (requestData.participantType === ParticipantType.MEMBER.toString()) {
      await this.validateLocation(requestData.newData);
    }
    if (requestData.participantType === ParticipantType.TEAM.toString() && !requestData.requesterEmailId) {
      throw new BadRequestException(
        'Requester email is required for team participation requests. Please provide a valid email address.'
      );
    }
  }
  
  /**
   * Send notification based on the participant type.
   * @param result 
   */
  private notifyForCreate(result: any): void {
    if (result.participantType === ParticipantType.MEMBER.toString()) {
      this.notificationService.notifyForCreateMember(result.newData.name, result.uid);
    } else {
      this.notificationService.notifyForCreateTeam(result.newData.name, result.uid);
    }
  }

  /**
   * Handles database-related errors specifically for the Participant entity.
   * Logs the error and throws an appropriate HTTP exception based on the error type.
   * 
   * @param {any} error - The error object thrown by Prisma or other services.
   * @param {string} [message] - An optional message to provide additional context, 
   *                             such as the participant UID when an entity is not found.
   * @throws {ConflictException} - If there's a unique key constraint violation.
   * @throws {BadRequestException} - If there's a foreign key constraint violation or validation error.
   * @throws {NotFoundException} - If a participant is not found with the provided UID.
   */
  private handleErrors(error, message?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException(
            'Unique key constraint error on Participant:',
            error.message
          );
        case 'P2003':
          throw new BadRequestException(
            'Foreign key constraint error on Participant',
            error.message
          );
        case 'P2025':
          throw new NotFoundException('Participant not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Participant', error.message);
    }
    return error;
  }

  
  generateMemberProfileURL(value) {
    return generateProfileURL(value);
  }
}
