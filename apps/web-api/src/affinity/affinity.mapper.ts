import {
  AffinityCompany,
  AffinityListMembership,
  AffinityPerson,
  AffinityPersonOrganization,
  Team,
} from '@prisma/client';
import {
  AffinityPersonRelationshipSource,
  MemberForOwnerResolve,
  toMemberRelationshipDto,
} from './affinity-relationship.mapper';

const decimalToNumber = (v: { toNumber(): number } | null | undefined): number | null =>
  v == null ? null : v.toNumber();

const dateToIso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export type AffinityCompanyRow = AffinityCompany & {
  listMemberships?: AffinityListMembership[];
  team?: Pick<Team, 'uid' | 'name' | 'website'> | null;
};

export function toAffinityCompanyDto(row: AffinityCompanyRow) {
  return {
    uid: row.uid,
    affinity_org_id: row.affinityOrgId,
    name: row.name,
    domain: row.domain,
    domains: row.domains,
    deal_status: row.dealStatus,
    tags: row.tags,
    priority: row.priority,
    kpi_list_status: row.kpiListStatus,
    mrr: decimalToNumber(row.mrr),
    revenue_ltm: decimalToNumber(row.revenueLtm),
    monthly_burn: decimalToNumber(row.monthlyBurn),
    cash_balance: decimalToNumber(row.cashBalance),
    runway_months: row.runwayMonths,
    team_fte: row.teamFte,
    post_money_valuation: decimalToNumber(row.postMoneyValuation),
    last_contact_at: dateToIso(row.lastContactAt),
    last_email_at: dateToIso(row.lastEmailAt),
    relationship_roles: row.relationshipRoles,
    fund_relevance: row.fundRelevance,
    team_uid: row.teamUid,
    link_method: row.linkMethod,
    link_confidence: row.linkConfidence,
    linked_at: dateToIso(row.linkedAt),
    linked_team: row.team ? { uid: row.team.uid, name: row.team.name, website: row.team.website } : null,
    list_memberships: (row.listMemberships ?? []).map(toListMembershipDto),
    pulled_at: dateToIso(row.pulledAt),
    updated_at: dateToIso(row.updatedAt),
  };
}

export function toListMembershipDto(row: AffinityListMembership) {
  return {
    affinity_list_id: row.affinityListId,
    affinity_list_entry_id: row.affinityListEntryId,
    list_name: row.listName,
    list_fields: row.listFields,
    updated_at: dateToIso(row.updatedAt),
  };
}

export function toAffinityPersonDto(row: AffinityPerson) {
  return {
    uid: row.uid,
    affinity_person_id: row.affinityPersonId,
    first_name: row.firstName,
    last_name: row.lastName,
    full_name: row.fullName,
    primary_email: row.primaryEmail,
    email_addresses: row.emailAddresses,
    current_job_title: row.currentJobTitle,
    current_organization_name: row.currentOrganizationName,
    current_organization_affinity_id: row.currentOrganizationAffinityId,
    relationship_tiers: row.relationshipTiers,
    relationship_roles: row.relationshipRoles,
    fund_relevance: row.fundRelevance,
    list_status: row.listStatus,
    standing: row.standing,
    engagement_score: row.engagementScore,
    relationship_score: row.relationshipScore,
    quality_score: row.qualityScore,
    last_contact_at: dateToIso(row.lastContactAt),
    last_email_at: dateToIso(row.lastEmailAt),
    member_uid: row.memberUid,
    link_method: row.linkMethod,
    link_confidence: row.linkConfidence,
    linked_at: dateToIso(row.linkedAt),
    primary_company_uid: row.primaryCompanyUid,
    pulled_at: dateToIso(row.pulledAt),
    updated_at: dateToIso(row.updatedAt),
  };
}

export type AffinityPersonWithRelations = AffinityPersonRelationshipSource & {
  listMemberships: AffinityListMembership[];
  primaryCompany: AffinityCompanyRow | null;
  organizations: Array<
    AffinityPersonOrganization & {
      company: AffinityCompanyRow;
    }
  >;
};

export function toMemberAffinityResponse(
  memberUid: string,
  person: AffinityPersonWithRelations,
  membersForResolve?: MemberForOwnerResolve[]
) {
  const primaryCompany = person.primaryCompany ? toAffinityCompanyDto(person.primaryCompany) : null;
  const organizations = person.organizations.map((edge) => ({
    affinity_org_id: edge.affinityOrgId,
    is_current: edge.isCurrent,
    job_title: edge.jobTitle,
    company: toAffinityCompanyDto(edge.company),
  }));

  return {
    member_uid: memberUid,
    person: {
      ...toAffinityPersonDto(person),
      list_memberships: person.listMemberships.map(toListMembershipDto),
    },
    primary_company: primaryCompany,
    organizations,
    relationship: toMemberRelationshipDto(person, membersForResolve),
  };
}
