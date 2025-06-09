import { Injectable } from '@nestjs/common';

@Injectable()
export class ProfileService {
  async getProfileCompletenessBy(memberUid: string) {
    return {
      memberUid,
      completeness: 40,
    };
  }
}
