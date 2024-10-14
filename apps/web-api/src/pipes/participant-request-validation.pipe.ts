import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import {
  ParticipantRequestMemberSchema,
  ParticipantRequestTeamSchema,
} from 'libs/contracts/src/schema/participants-request';
import { ZodError } from 'zod';

@Injectable()
export class ParticipantsReqValidationPipe implements PipeTransform {
  /**
   * Transforms and validates the incoming request body based on the participant type.
   * @param value - The incoming request body
   * @param metadata - The metadata of the argument (checks if it is 'body')
   * @returns The validated value or throws an exception if validation fails
   */
  transform(value: any, metadata: ArgumentMetadata): any {
    if (metadata.type !== 'body') {
      return value;
    }
    try {
      const { participantType } = value;
      if (participantType === 'MEMBER') {
        ParticipantRequestMemberSchema.parse(value);
      } else if (participantType === 'TEAM') {
        ParticipantRequestTeamSchema.parse(value);
      } else {
        throw new BadRequestException({
          statusCode: 400,
          message: `Invalid participant request type ${participantType}`,
        });
      }
      return value;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Participant request validation failed',
          errors: error.errors,
        });
      }
      throw error;
    }
  }
}
