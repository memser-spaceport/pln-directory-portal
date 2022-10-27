import { ConfigProfile } from './config-profile';
import { DISABLED_PROFILE, ENABLED_PROFILE } from './defaults';

export const loadProfile = (
  profile: 'enabled' | 'disabled' | ConfigProfile | undefined
): ConfigProfile => {
  if (!profile || profile === 'enabled') {
    return ENABLED_PROFILE;
  } else if (profile === 'disabled') {
    return DISABLED_PROFILE;
  } else {
    return profile;
  }
};
