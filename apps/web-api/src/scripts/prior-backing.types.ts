/** Prior-backer flags attached to hopChain JSON (warm-intro ranking + FE). */
export interface PriorBackingFlags {
  backedProtocolLabs: boolean;
  backedFilecoin: boolean;
  matchKind: 'person' | 'firm' | 'both';
  source: 'affinity-list-166215';
  firmName?: string;
  affinityOrgId?: number;
}

export interface PlInvestorPersonRef {
  affinityPersonId: number;
  name: string;
  email?: string;
}

export interface PlInvestorFirmEntry {
  firmName: string;
  affinityOrgId: number;
  domains: string[];
  people: PlInvestorPersonRef[];
  backedProtocolLabs: boolean;
  backedFilecoin: boolean;
}

export interface PlInvestorsIndex {
  byAffinityPersonId: Map<number, PlInvestorFirmEntry>;
  byEmail: Map<string, PlInvestorFirmEntry>;
  byFirmKey: Map<string, PlInvestorFirmEntry>;
}
