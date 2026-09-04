import { Injectable, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { MemberApprovalState, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';

/**
 * Approval states whose members are visible in *public* subscription reads --
 * follower avatar strips, follower counts, featured location cards. Members who
 * are not yet approved are deliberately kept out of those lists.
 */
const PUBLICLY_VISIBLE_APPROVAL_STATES: MemberApprovalState[] = [
  MemberApprovalState.APPROVED,
  MemberApprovalState.VERIFIED,
];

/**
 * Approval states that still *receive* the updates they subscribed to. A member
 * who follows something while their approval is pending asked for those updates
 * and should get them; only a rejected member is dropped.
 */
const NOTIFIABLE_APPROVAL_STATES: MemberApprovalState[] = [
  MemberApprovalState.APPROVED,
  MemberApprovalState.VERIFIED,
  MemberApprovalState.PENDING,
];

@Injectable()
export class MemberSubscriptionService {
  private readonly logger = new Logger(MemberSubscriptionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private cacheService: CacheService
  ) { }

  /**
   * Creates a new subscription record in the database.
   * @param subcription - The data for the subscription to be created, adhering to Prisma's `MemberSubscriptionUncheckedCreateInput`.
   * @returns The created subscription record.
   * @throws ConflictException if a unique constraint is violated.
   * @throws BadRequestException if a validation error occurs.
   */
  async createSubscription(subcription: Prisma.MemberSubscriptionUncheckedCreateInput) {
    try {
      const subscriber = await this.prisma.memberSubscription.create({
        data: {
          ...subcription,
        },
      });
      await this.cacheService.reset({ service: 'member-subscription' });
      return subscriber;
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Updates a subscription record in the database by its unique identifier (uid).
   * @param uid - The unique identifier of the subscription record to update.
   * @param subcription - The fields to update in the subscription record.
   * @returns The updated subscription record.
   * @throws NotFoundException if no subscription record is found with the provided uid.
   */
  async modifySubscription(uid: string, subcription: Prisma.MemberSubscriptionUncheckedUpdateInput) {
    try {
      const result = await this.prisma.memberSubscription.update({
        where: {
          uid,
        },
        data: {
          ...subcription
        }
      });
      await this.cacheService.reset({ service: 'member-subscription' });
      return result;
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

  /**
   * Updates a subscription record that belongs to `memberUid`.
   *
   * `MemberSubscription.uid` is unique but `memberUid` is not part of any
   * compound unique, so `update` cannot express "this row, and it must be mine".
   * `updateMany` can, and a zero count is the not-found/not-yours answer -- the
   * caller learns nothing about a row it does not own.
   *
   * Ownership itself is never editable here: `memberUid` is a scope, not a field.
   *
   * @param uid - The subscription to update.
   * @param memberUid - The member the subscription must belong to.
   * @param subscription - The fields to update.
   * @returns The updated subscription record.
   * @throws NotFoundException if no subscription with that uid belongs to the member.
   */
  async modifyOwnSubscription(
    uid: string,
    memberUid: string,
    subscription: Prisma.MemberSubscriptionUncheckedUpdateInput
  ) {
    try {
      const { memberUid: _ignored, uid: _uid, ...data } = subscription as Record<string, unknown>;
      const { count } = await this.prisma.memberSubscription.updateMany({
        where: { uid, memberUid },
        data,
      });
      if (count === 0) {
        throw new NotFoundException('Subscription not found with uid: ' + uid);
      }
      await this.cacheService.reset({ service: 'member-subscription' });
      return await this.prisma.memberSubscription.findUnique({ where: { uid } });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.handleErrors(error, uid);
    }
  }

  /**
   * Subscribes a member to an entity, reactivating an existing row rather than
   * inserting a second one.
   *
   * `MemberSubscription` has only a non-unique index on
   * (memberUid, entityUid, entityType), so a plain create silently accumulates
   * duplicate active rows on repeat clicks -- each of which then has to be
   * cancelled separately. The lookup is member-scoped (not approval-filtered) so
   * it also finds the rows of a member who is not yet approved.
   *
   * @param subscription - The subscription to create or reactivate.
   * @returns The created or reactivated subscription record.
   */
  async subscribe(subscription: Prisma.MemberSubscriptionUncheckedCreateInput) {
    const existing = await this.getSubscriptionsForMember(subscription.memberUid, {
      where: {
        entityUid: subscription.entityUid,
        entityType: subscription.entityType,
        entityAction: subscription.entityAction,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing?.length) {
      return await this.modifyOwnSubscription(existing[0].uid, subscription.memberUid, { isActive: true });
    }
    return await this.createSubscription(subscription);
  }

  /**
   * Retrieves multiple member subscription records based on the provided query criteria.
   *
   * This method leverages Prisma's `findMany` to perform a flexible query.
   * The query object allows the caller to specify filters, sorting, pagination,
   * and include related entities as needed.
   *
   * @param query - A `Prisma.MemberFollowFindManyArgs` object that defines the query criteria.
   *   - `where`: Conditions to filter the records (e.g., by `memberUid` or `status`).
   *   - `orderBy`: Sorting criteria for the results (e.g., by `createdAt` in ascending order).
   *   - `skip`: The number of records to skip for pagination.
   *   - `take`: The number of records to retrieve (limit for pagination).
   *   - `include`: Related entities to include in the results (e.g., `member`).
   *
   * @returns An array of member subscription records matching the query criteria.
   *
   * Public read: results are restricted to members in `PUBLICLY_VISIBLE_APPROVAL_STATES`.
   * For a member's own follow state use `getSubscriptionsForMember`, and for
   * notification delivery use `getNotifiableSubscribers`.
   */
  async getSubscriptions(query: Prisma.MemberSubscriptionFindManyArgs) {
    try {
      return await this.prisma.memberSubscription.findMany({
        ...query,
        where: {
          ...query.where,
          member: {
            memberApproval: { state: { in: PUBLICLY_VISIBLE_APPROVAL_STATES } },
          },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Retrieves the subscriptions of a single member, on that member's own behalf.
   *
   * Deliberately NOT approval-filtered, unlike `getSubscriptions`: a member can
   * always see -- and therefore cancel -- their own subscriptions, whatever their
   * approval state. Reading self-state through the public list is what made an
   * unapproved member's follow uncancellable.
   *
   * Never use this to build a list shown to anybody other than `memberUid`.
   *
   * @param memberUid - The member whose own subscriptions are being read.
   * @param query - Optional additional criteria; its `where` is merged under the member scope.
   * @returns The member's subscription records.
   */
  async getSubscriptionsForMember(memberUid: string, query: Prisma.MemberSubscriptionFindManyArgs = {}) {
    try {
      return await this.prisma.memberSubscription.findMany({
        ...query,
        where: {
          ...query.where,
          memberUid,
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Retrieves the subscribers that should actually be *notified* for an entity.
   *
   * Wider than `getSubscriptions` (a pending member still receives what they
   * subscribed to) and narrower than unfiltered (a rejected member does not).
   *
   * @param query - A `Prisma.MemberSubscriptionFindManyArgs` describing the entity.
   * @returns The subscription records whose members are eligible for delivery.
   */
  async getNotifiableSubscribers(query: Prisma.MemberSubscriptionFindManyArgs) {
    try {
      return await this.prisma.memberSubscription.findMany({
        ...query,
        where: {
          ...query.where,
          member: {
            memberApproval: { state: { in: NOTIFIABLE_APPROVAL_STATES } },
          },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }


  /**
   * Handles errors occurring during database operations.
   * Logs the error and rethrows it with a more specific exception if applicable.
   * @param error - The error object thrown by Prisma.
   * @param message - An optional message providing additional context, such as the uid causing the error.
   * @throws ConflictException, BadRequestException, NotFoundException, or the original error.
   */
  private handleErrors(error: any, message?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': // Unique constraint violation
          throw new ConflictException('Unique key constraint error on subscription:', error.message);
        case 'P2003': // Foreign key constraint violation
          throw new BadRequestException('Foreign key constraint error on subscription:', error.message);
        case 'P2025': // Record not found
          throw new NotFoundException('Subscription not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database validation error on follow:', error.message);
    }
    throw error;
  }
}
