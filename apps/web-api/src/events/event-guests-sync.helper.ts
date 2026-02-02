import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { Prisma } from '@prisma/client';
import { AssociationRole as AssociationRoleType } from '@protocol-labs-network/contracts';

/**
 * Processed association data from syncEventAssociations.
 */
export interface ProcessedAssociation {
  _id: string;
  entityType: 'MEMBER' | 'TEAM';
  entityUid: string;
  role: AssociationRoleType;
}

/**
 * Input data for creating/updating a PLEventGuest record.
 */
export interface GuestSyncInput {
  memberUid: string;
  eventUid: string;
  locationUid: string;
  role: AssociationRoleType;
}

/**
 * Syncs PLEventGuest records from event associations.
 * 
 * Handles MEMBER associations by creating guest records with member's main team.
 * TEAM associations are logged but not yet implemented.
 * 
 * Role to flag mapping:
 * - HOST/CO_HOST → isHost=true
 * - SPEAKER → isSpeaker=true
 * - SPONSOR → isSponsor=true
 * - ATTENDEE → all flags false
 */
@Injectable()
export class EventGuestSyncHelper {
  private readonly LOG_CONTEXT = 'EventGuestSyncHelper';

  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private membersService: MembersService,
  ) {}

  /**
   * Syncs guests for all processed associations in parallel.
   * Creates PLEventGuest for MEMBER associations using member's main team.
   * TEAM associations are not yet implemented.
   * 
   * @param eventUid - PLEvent UID
   * @param locationUid - PLEventLocation UID
   * @param associations - Processed associations from syncEventAssociations
   * @param tx - Optional transaction client
   * @returns void
   */
  async syncEventGuests(
    eventUid: string,
    locationUid: string,
    associations: ProcessedAssociation[],
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    if (!associations?.length) {
      this.logger.info(`No associations to sync guests for`, this.LOG_CONTEXT);
      return;
    }
    await Promise.allSettled(
      associations.map(async (association) => {
        const logContext = `[GuestSync] assoc=${association._id} event=${eventUid} entity=${association.entityType}`;
        try {
          if (association.entityType === 'MEMBER') {
            await this.syncGuest({
              memberUid: association.entityUid,
              eventUid,
              locationUid,
              role: association.role
            }, tx);
          } else if (association.entityType === 'TEAM') {
            this.logger.info(`${logContext} - Team guest sync not implemented`, this.LOG_CONTEXT);
          }
        } catch (error) {
          this.logger.error(`${logContext} - Failed: ${error.message}`, error.stack, this.LOG_CONTEXT);
        }
      })
    );
  }

  /**
   * Creates or updates a PLEventGuest record for a member.
   * Uses member's main team and sets role flags based on association role.
   * 
   * @param input - Guest sync input data
   * @param tx - Optional transaction client
   * @returns void
   */
  async syncGuest(input: GuestSyncInput, tx?: Prisma.TransactionClient) {
    const logContext = `[GuestSync] event=${input.eventUid} member=${input.memberUid} role=${input.role}`;
    try {
      // PLEventGuest is member-centric; a member can belong to multiple teams,
      // so we use main team only to ensure single team association per member per event.
      const teamUid = await this.membersService.getMemberMainTeamByUid(input.memberUid, tx || this.prisma);
      const guest = await this.upsertGuest(input, teamUid, tx);    
      this.logger.info(`${logContext} - Guest synced uid=${guest.uid}`, this.LOG_CONTEXT);
      return { success: true, guestUid: guest.uid };
    } catch (error) {
      this.logger.error(`${logContext} - Failed: ${error.message}`, error.stack, this.LOG_CONTEXT);
      return { success: false, error: error.message };
    }
  }

  /**
   * Maps association role to PLEventGuest boolean flags.
   * 
   * @param role - Association role
   * @returns Role flags
   */
  private getRoleFlags(role: AssociationRoleType): {
    isHost: boolean;
    isSpeaker: boolean;
    isSponsor: boolean;
  } {
    switch (role) {
      case 'HOST':
      case 'CO_HOST':
        return { isHost: true, isSpeaker: false, isSponsor: false };
      case 'SPEAKER':
        return { isHost: false, isSpeaker: true, isSponsor: false };
      case 'SPONSOR':
        return { isHost: false, isSpeaker: false, isSponsor: true };
      default:
        return { isHost: false, isSpeaker: false, isSponsor: false };
    }
  }

  /**
   * Creates new or updates existing PLEventGuest record.
   * 
   * @param input - Guest sync input data
   * @param teamUid - Member's main team UID
   * @param tx - Optional transaction client
   * @returns PLEventGuest record
   */
  private async upsertGuest(
    input: GuestSyncInput,
    teamUid: string | null,
    tx?: Prisma.TransactionClient
  ) {
    const prisma = tx || this.prisma;
    const flags = this.getRoleFlags(input.role);
    const existingGuest = await prisma.pLEventGuest.findFirst({
      where: {
        memberUid: input.memberUid,
        eventUid: input.eventUid,
        locationUid: input.locationUid,
      },
      select: { uid: true },
    });
    if (existingGuest) {
      return prisma.pLEventGuest.update({
        where: { uid: existingGuest.uid },
        data: { teamUid, ...flags },
      });
    }
    return prisma.pLEventGuest.create({
      data: {
        memberUid: input.memberUid,
        eventUid: input.eventUid,
        locationUid: input.locationUid,
        teamUid,
        ...flags,
      },
    });
  }
}

