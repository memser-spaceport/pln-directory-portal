import { z } from 'zod';

/**
 * Enum schemas for association role and entity type
 */
export const AssociationRoleEnum = z.enum(['HOST', 'CO_HOST', 'SPEAKER', 'SPONSOR', 'ATTENDEE']);
export const AssociationEntityTypeEnum = z.enum(['MEMBER', 'TEAM']);

export type AssociationRole = z.infer<typeof AssociationRoleEnum>;
export type AssociationEntityType = z.infer<typeof AssociationEntityTypeEnum>;

/**
 * Schema for entity details containing representing team information.
 * Used primarily for ATTENDEE role to specify which team the member represents.
 */
export const EntityDetailsSchema = z.object({
  representingTeamUid: z.string().optional(),
  representingTeamName: z.string().optional(),
}).passthrough();

/**
 * Schema for validating incoming association data from events-service.
 * Only resolved associations (with entityType and entityUid) are valid for syncing.
 */
export const PLEventAssociationInputSchema = z.object({
  _id: z.string().min(1, 'Association ID is required'),
  role: AssociationRoleEnum,
  searchTerm: z.string().min(1, 'Search term is required'),
  entityType: AssociationEntityTypeEnum,
  entityUid: z.string().min(1, 'Entity UID is required'),
  entityDetails: EntityDetailsSchema.optional(),
  createdBy: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type PLEventAssociationInput = z.infer<typeof PLEventAssociationInputSchema>;
