import { SetMetadata } from '@nestjs/common';
import { AccessLevel } from '../utils/access-levels';

export const ACCESS_LEVELS_KEY = 'access-levels';
export const AccessLevels = (...accessLevels: AccessLevel[]) => SetMetadata(ACCESS_LEVELS_KEY, accessLevels);
