/**
 * Demo Day Host enum - the organizations that can host Demo Days
 */
export enum DemoDayHost {
  FOUNDERS_FORGE = 'Founders Forge',
  CRECIMIENTO = 'Crecimiento',
  FOUNDER_SCHOOL = 'Founder School',
  PROTOCOL_LABS = 'Protocol Labs',
}

/**
 * Array of all Demo Day host values for iteration/dropdown options
 */
export const DEMO_DAY_HOSTS = Object.values(DemoDayHost);
