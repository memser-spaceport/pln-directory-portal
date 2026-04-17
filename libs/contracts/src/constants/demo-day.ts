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

/**
 * Predefined program options for the Program field multi-select
 */
export const DEMO_DAY_PROGRAM_OPTIONS = [
  'Crecimiento',
  'Founder School',
] as const;
