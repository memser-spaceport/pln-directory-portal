import { Injectable, Logger } from '@nestjs/common';
import { AffinityEntityLinkMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  AffinityCompanyIngestItem,
  AffinityPersonIngestItem,
  IngestAffinityDto,
  IngestAffinityResponse,
} from './dto/ingest-affinity.dto';
import {
  buildMemberMatchIndex,
  buildTeamMatchIndex,
  matchCompanySidecar,
  matchMember,
  matchTeam,
} from './affinity-match.util';
import { dbTierFromApi, resolveOwnerMemberUid, resolveRelationshipOwner } from './affinity-relationship.mapper';

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function dec(value: number | null | undefined): Prisma.Decimal | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(value);
}

function toInt(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

export function mergeAffinityIngestResponses(
  a: IngestAffinityResponse,
  b: IngestAffinityResponse
): IngestAffinityResponse {
  return {
    runId: a.runId,
    received: {
      companies: a.received.companies + b.received.companies,
      persons: a.received.persons + b.received.persons,
    },
    ingested: {
      companies: a.ingested.companies + b.ingested.companies,
      persons: a.ingested.persons + b.ingested.persons,
    },
    linked: {
      companiesToTeam: a.linked.companiesToTeam + b.linked.companiesToTeam,
      personsToMember: a.linked.personsToMember + b.linked.personsToMember,
      personsToCompany: a.linked.personsToCompany + b.linked.personsToCompany,
    },
    unmatched: {
      companies: a.unmatched.companies + b.unmatched.companies,
      persons: a.unmatched.persons + b.unmatched.persons,
    },
    failed: a.failed + b.failed,
    errors: [...(a.errors ?? []), ...(b.errors ?? [])],
  };
}

@Injectable()
export class AffinityService {
  private readonly logger = new Logger(AffinityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: IngestAffinityDto): Promise<IngestAffinityResponse> {
    const companies = dto.companies ?? [];
    const persons = dto.persons ?? [];
    const response: IngestAffinityResponse = {
      runId: dto.runId,
      received: { companies: companies.length, persons: persons.length },
      ingested: { companies: 0, persons: 0 },
      linked: { companiesToTeam: 0, personsToMember: 0, personsToCompany: 0 },
      unmatched: { companies: 0, persons: 0 },
      failed: 0,
      errors: [],
    };

    const run = await this.prisma.affinityIngestRun.upsert({
      where: { id: dto.runId },
      create: {
        id: dto.runId,
        scope: dto.scope,
        dryRun: dto.dryRun ?? false,
        status: 'RUNNING',
      },
      update: {
        scope: dto.scope,
        dryRun: dto.dryRun ?? false,
        status: 'RUNNING',
        finishedAt: null,
        errorMessage: null,
      },
    });

    try {
      const [teams, members, existingCompanies, existingPersons] = await Promise.all([
        this.prisma.team.findMany({
          select: { uid: true, name: true, airtableRecId: true, website: true },
        }),
        this.prisma.member.findMany({
          select: { uid: true, name: true, email: true, airtableRecId: true },
        }),
        this.prisma.affinityCompany.findMany({
          select: { uid: true, affinityOrgId: true, teamUid: true },
        }),
        this.prisma.affinityPerson.findMany({
          select: { uid: true, affinityPersonId: true, memberUid: true },
        }),
      ]);

      const teamIndex = buildTeamMatchIndex(teams);
      for (const c of existingCompanies) {
        if (c.teamUid) teamIndex.byExistingAffinityOrgId.set(c.affinityOrgId, c.teamUid);
      }

      const memberIndex = buildMemberMatchIndex(members);
      for (const p of existingPersons) {
        if (p.memberUid) memberIndex.byExistingAffinityPersonId.set(p.affinityPersonId, p.memberUid);
      }

      const companySidecarByOrgId = new Map(existingCompanies.map((c) => [c.affinityOrgId, c.uid]));
      const teamUidOwner = new Map<string, string>();
      for (const c of existingCompanies) {
        if (c.teamUid) teamUidOwner.set(c.teamUid, c.affinityOrgId);
      }
      const memberUidOwner = new Map<string, string>();
      for (const p of existingPersons) {
        if (p.memberUid) memberUidOwner.set(p.memberUid, p.affinityPersonId);
      }

      const companyListFieldsByOrgId = new Map<string, Record<string, unknown>[]>();

      if (!dto.dryRun) {
        for (let i = 0; i < companies.length; i++) {
          try {
            const linked = await this.upsertCompany(
              companies[i],
              dto.runId,
              teamIndex,
              companySidecarByOrgId,
              teamUidOwner
            );
            const orgId = companies[i]?.affinity_org_id;
            if (orgId) {
              const fields = (companies[i]?.list_memberships ?? [])
                .map((m) => m.list_fields)
                .filter((f): f is Record<string, unknown> => Boolean(f));
              if (fields.length) companyListFieldsByOrgId.set(orgId, fields);
            }
            response.ingested.companies++;
            if (linked) response.linked.companiesToTeam++;
            else response.unmatched.companies++;
          } catch (e) {
            response.failed++;
            response.errors?.push(
              `Company ${i} (${companies[i]?.affinity_org_id}): ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }

        for (let i = 0; i < persons.length; i++) {
          try {
            const linked = await this.upsertPerson(
              persons[i],
              dto.runId,
              memberIndex,
              companySidecarByOrgId,
              memberUidOwner,
              members,
              companyListFieldsByOrgId
            );
            response.ingested.persons++;
            if (linked.member) response.linked.personsToMember++;
            else response.unmatched.persons++;
            if (linked.company) response.linked.personsToCompany++;
          } catch (e) {
            response.failed++;
            response.errors?.push(
              `Person ${i} (${persons[i]?.affinity_person_id}): ${e instanceof Error ? e.message : String(e)}`
            );
          }
        }
      } else {
        for (const item of companies) {
          const m = matchTeam(
            {
              affinityOrgId: item.affinity_org_id,
              name: item.name,
              buildersFunnelRecordId: item.builders_funnel_record_id,
              domain: item.domain,
              domains: item.domains,
            },
            teamIndex
          );
          if (m) response.linked.companiesToTeam++;
          else response.unmatched.companies++;
        }
        for (const item of persons) {
          const m = matchMember(
            {
              affinityPersonId: item.affinity_person_id,
              firstName: item.first_name,
              lastName: item.last_name,
              fullName: item.full_name,
              buildersFunnelRecordId: item.builders_funnel_record_id,
              primaryEmail: item.primary_email,
              emailAddresses: item.email_addresses,
            },
            memberIndex
          );
          if (m) response.linked.personsToMember++;
          else response.unmatched.persons++;
          const companyUid = matchCompanySidecar(item.current_organization_affinity_id, {
            byAffinityOrgId: companySidecarByOrgId,
          });
          if (companyUid) response.linked.personsToCompany++;
        }
      }

      const prevStats = run.stats as IngestAffinityResponse | null;
      const finalStats =
        prevStats && typeof prevStats === 'object' && 'runId' in prevStats
          ? mergeAffinityIngestResponses(prevStats, response)
          : response;

      await this.prisma.affinityIngestRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          finishedAt: new Date(),
          stats: finalStats as unknown as Prisma.InputJsonValue,
        },
      });

      return response;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.affinityIngestRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: msg },
      });
      throw e;
    }
  }

  private companyData(
    item: AffinityCompanyIngestItem,
    runId: string,
    link?: { teamUid: string; method: AffinityEntityLinkMethod; confidence: number }
  ): Prisma.AffinityCompanyUncheckedCreateInput {
    return {
      affinityOrgId: item.affinity_org_id,
      name: item.name,
      domain: item.domain ?? null,
      domains: item.domains ?? [],
      buildersFunnelRecordId: item.builders_funnel_record_id ?? null,
      dealStatus: item.deal_status ?? null,
      tags: item.tags ?? [],
      tokenStatus: item.token_status ?? null,
      postMoneyValuation: dec(item.post_money_valuation),
      exitDate: parseIsoDate(item.exit_date),
      deckLink: item.deck_link ?? null,
      acceleratorProgram: item.accelerator_program ?? null,
      investorType: item.investor_type ?? null,
      relationshipRoles: item.relationship_roles ?? [],
      fundRelevance: item.fund_relevance ?? [],
      description: item.description ?? null,
      investmentStage: item.investment_stage ?? null,
      industries: item.industries ?? [],
      investors: item.investors ?? [],
      yearFounded: toInt(item.year_founded),
      totalFundingUsd: dec(item.total_funding_usd),
      lastFundingUsd: dec(item.last_funding_usd),
      lastFundingDate: parseIsoDate(item.last_funding_date),
      linkedinUrl: item.linkedin_url ?? null,
      employeeCount: toInt(item.employee_count),
      linkedinHeadcount: toInt(item.linkedin_headcount),
      location: item.location ? (item.location as Prisma.InputJsonValue) : Prisma.JsonNull,
      priority: item.priority ?? null,
      kpiListStatus: item.kpi_list_status ?? null,
      mrr: dec(item.mrr),
      revenueLtm: dec(item.revenue_ltm),
      monthlyBurn: dec(item.monthly_burn),
      cashBalance: dec(item.cash_balance),
      runwayMonths: toInt(item.runway_months),
      teamFte: toInt(item.team_fte),
      totalUsers: toInt(item.total_users),
      maus: toInt(item.maus),
      daus: toInt(item.daus),
      initialInvestmentUsd: dec(item.initial_investment_usd),
      valuationAtInvestmentUsd: dec(item.valuation_at_investment_usd),
      latestPostMoneyUsd: dec(item.latest_post_money_usd),
      fundedVia: item.funded_via ?? [],
      kpiLastUpdateAt: parseIsoDate(item.kpi_last_update_at),
      planToFundraise6Mo: item.plan_to_fundraise_6mo ?? null,
      lastContactAt: parseIsoDate(item.last_contact_at),
      lastEmailAt: parseIsoDate(item.last_email_at),
      firstEmailAt: parseIsoDate(item.first_email_at),
      lastEventAt: parseIsoDate(item.last_event_at),
      firstEventAt: parseIsoDate(item.first_event_at),
      nextEventAt: parseIsoDate(item.next_event_at),
      sourceOfIntroduction: item.source_of_introduction
        ? (item.source_of_introduction as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      linkedPersonIds: item.linked_person_ids ?? [],
      rawFields: item.raw_fields as Prisma.InputJsonValue,
      lastIngestRunId: runId,
      pulledAt: new Date(),
      ...(link
        ? {
            teamUid: link.teamUid,
            linkMethod: link.method,
            linkConfidence: link.confidence,
            linkedAt: new Date(),
          }
        : {}),
    };
  }

  private async upsertCompany(
    item: AffinityCompanyIngestItem,
    runId: string,
    teamIndex: ReturnType<typeof buildTeamMatchIndex>,
    companySidecarByOrgId: Map<string, string>,
    teamUidOwner: Map<string, string>
  ): Promise<boolean> {
    const match = matchTeam(
      {
        affinityOrgId: item.affinity_org_id,
        name: item.name,
        buildersFunnelRecordId: item.builders_funnel_record_id,
        domain: item.domain,
        domains: item.domains,
      },
      teamIndex
    );

    let link = match ? { teamUid: match.uid, method: match.method, confidence: match.confidence } : undefined;
    if (link) {
      const ownerOrgId = teamUidOwner.get(link.teamUid);
      if (ownerOrgId && ownerOrgId !== item.affinity_org_id) {
        link = undefined;
      } else {
        teamUidOwner.set(link.teamUid, item.affinity_org_id);
      }
    }

    const data = this.companyData(item, runId, link);
    const row = await this.prisma.affinityCompany.upsert({
      where: { affinityOrgId: item.affinity_org_id },
      create: data,
      update: data,
    });
    companySidecarByOrgId.set(item.affinity_org_id, row.uid);

    const listIds = (item.list_memberships ?? []).map((m) => m.affinity_list_entry_id);
    if (listIds.length > 0) {
      await this.prisma.affinityListMembership.deleteMany({
        where: { companyUid: row.uid, affinityListEntryId: { in: listIds } },
      });
    }
    for (const m of item.list_memberships ?? []) {
      await this.prisma.affinityListMembership.upsert({
        where: { affinityListEntryId: m.affinity_list_entry_id },
        create: {
          affinityListId: m.affinity_list_id,
          affinityListEntryId: m.affinity_list_entry_id,
          listName: m.list_name,
          companyUid: row.uid,
          listFields: (m.list_fields ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
        update: {
          affinityListId: m.affinity_list_id,
          listName: m.list_name,
          companyUid: row.uid,
          personUid: null,
          listFields: (m.list_fields ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    }

    return Boolean(link);
  }

  private personData(
    item: AffinityPersonIngestItem,
    runId: string,
    links: {
      member?: { uid: string; method: AffinityEntityLinkMethod; confidence: number };
      primaryCompanyUid?: string | null;
      relationshipOwnerMemberUid?: string | null;
    }
  ): Prisma.AffinityPersonUncheckedCreateInput {
    return {
      affinityPersonId: item.affinity_person_id,
      firstName: item.first_name ?? null,
      lastName: item.last_name ?? null,
      fullName: item.full_name ?? null,
      primaryEmail: item.primary_email ?? null,
      emailAddresses: item.email_addresses ?? [],
      buildersFunnelRecordId: item.builders_funnel_record_id ?? null,
      telegram: item.telegram ?? null,
      linkedinUrl: item.linkedin_url ?? null,
      phoneNumbers: item.phone_numbers ?? [],
      currentJobTitle: item.current_job_title ?? null,
      currentOrganizationName: item.current_organization_name ?? null,
      currentOrganizationAffinityId: item.current_organization_affinity_id ?? null,
      industries: item.industries ?? [],
      location: item.location ? (item.location as Prisma.InputJsonValue) : Prisma.JsonNull,
      relationshipTiers: item.relationship_tiers ?? [],
      relationshipRoles: item.relationship_roles ?? [],
      fundRelevance: item.fund_relevance ?? [],
      investorTypes: item.investor_types ?? [],
      stagePreference: item.stage_preference ?? null,
      sectorFocus: item.sector_focus ?? null,
      dataSources: item.data_sources ?? [],
      dataQuality: item.data_quality ?? null,
      engagementScore: item.engagement_score ?? null,
      relationshipScore: item.relationship_score ?? null,
      qualityScore: item.quality_score ?? null,
      keyContact: item.key_contact ?? null,
      standing: item.standing ?? null,
      listStatus: item.list_status ?? null,
      gender: item.gender ?? null,
      lastContactAt: parseIsoDate(item.last_contact_at),
      lastEmailAt: parseIsoDate(item.last_email_at),
      firstEmailAt: parseIsoDate(item.first_email_at),
      lastEventAt: parseIsoDate(item.last_event_at),
      firstEventAt: parseIsoDate(item.first_event_at),
      nextEventAt: parseIsoDate(item.next_event_at),
      sourceOfIntroduction: item.source_of_introduction
        ? (item.source_of_introduction as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      relationshipOwnerName: item.relationship_owner?.name ?? null,
      relationshipOwnerEmail: item.relationship_owner?.email ?? null,
      relationshipOwnerAffinityPersonId: item.relationship_owner?.affinity_person_id ?? null,
      relationshipOwnerMemberUid: links.relationshipOwnerMemberUid ?? null,
      lastContactSummary: item.last_contact_summary ?? null,
      lastContactMethod: item.last_contact_method ?? null,
      touchpoints6m: item.touchpoints_6m ?? null,
      touchpointsByMonth: item.touchpoints_by_month
        ? (item.touchpoints_by_month as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      frequencyTier: dbTierFromApi(item.frequency_tier),
      interactionWindowMonths: item.interaction_window_months ?? 6,
      relationshipStatsPulledAt: item.touchpoints_6m != null || item.frequency_tier != null ? new Date() : null,
      rawFields: item.raw_fields as Prisma.InputJsonValue,
      lastIngestRunId: runId,
      pulledAt: new Date(),
      primaryCompanyUid: links.primaryCompanyUid ?? null,
      ...(links.member
        ? {
            memberUid: links.member.uid,
            linkMethod: links.member.method,
            linkConfidence: links.member.confidence,
            linkedAt: new Date(),
          }
        : {}),
    };
  }

  private async upsertPerson(
    item: AffinityPersonIngestItem,
    runId: string,
    memberIndex: ReturnType<typeof buildMemberMatchIndex>,
    companySidecarByOrgId: Map<string, string>,
    memberUidOwner: Map<string, string>,
    members: Array<{ uid: string; email: string | null; name: string }>,
    companyListFieldsByOrgId: Map<string, Record<string, unknown>[]>
  ): Promise<{ member: boolean; company: boolean }> {
    const memberMatch = matchMember(
      {
        affinityPersonId: item.affinity_person_id,
        firstName: item.first_name,
        lastName: item.last_name,
        fullName: item.full_name,
        buildersFunnelRecordId: item.builders_funnel_record_id,
        primaryEmail: item.primary_email,
        emailAddresses: item.email_addresses,
      },
      memberIndex
    );

    let memberLink = memberMatch
      ? { uid: memberMatch.uid, method: memberMatch.method, confidence: memberMatch.confidence }
      : undefined;
    if (memberLink) {
      const ownerPersonId = memberUidOwner.get(memberLink.uid);
      if (ownerPersonId && ownerPersonId !== item.affinity_person_id) {
        memberLink = undefined;
      } else {
        memberUidOwner.set(memberLink.uid, item.affinity_person_id);
      }
    }

    const primaryCompanyUid = matchCompanySidecar(item.current_organization_affinity_id, {
      byAffinityOrgId: companySidecarByOrgId,
    });

    let relationshipOwner = item.relationship_owner;
    if (!relationshipOwner?.name?.trim()) {
      const companyListFields: Array<{ listFields: Prisma.JsonValue }> = [];
      const orgIds = [
        item.current_organization_affinity_id,
        ...(item.organizations ?? []).map((o) => o.affinity_org_id),
      ].filter((id): id is string => Boolean(id?.trim()));
      const seen = new Set<string>();
      for (const orgId of orgIds) {
        if (seen.has(orgId)) continue;
        seen.add(orgId);
        for (const fields of companyListFieldsByOrgId.get(orgId) ?? []) {
          companyListFields.push({ listFields: fields as Prisma.JsonValue });
        }
      }
      const resolved = resolveRelationshipOwner({
        personListMemberships: (item.list_memberships ?? []).map((m) => ({
          listFields: (m.list_fields ?? null) as Prisma.JsonValue,
        })),
        companyListMemberships: companyListFields,
        keyContact: item.key_contact,
        rawFields: item.raw_fields as Prisma.JsonValue,
      });
      if (resolved) {
        relationshipOwner = {
          name: resolved.name,
          email: resolved.email ?? null,
          affinity_person_id: resolved.affinity_person_id ?? null,
        };
        item.relationship_owner = relationshipOwner;
      }
    }

    const data = this.personData(item, runId, {
      member: memberLink,
      primaryCompanyUid,
      relationshipOwnerMemberUid: resolveOwnerMemberUid(
        {
          name: relationshipOwner?.name ?? item.relationship_owner?.name,
          email: relationshipOwner?.email ?? item.relationship_owner?.email,
        },
        members
      ),
    });

    const row = await this.prisma.affinityPerson.upsert({
      where: { affinityPersonId: item.affinity_person_id },
      create: data,
      update: data,
    });

    for (const org of item.organizations ?? []) {
      const companyUid = companySidecarByOrgId.get(org.affinity_org_id);
      if (!companyUid) continue;
      await this.prisma.affinityPersonOrganization.upsert({
        where: { personUid_companyUid: { personUid: row.uid, companyUid } },
        create: {
          personUid: row.uid,
          companyUid,
          affinityOrgId: org.affinity_org_id,
          affinityPersonId: item.affinity_person_id,
          isCurrent: org.is_current ?? false,
          jobTitle: org.job_title ?? null,
        },
        update: {
          isCurrent: org.is_current ?? false,
          jobTitle: org.job_title ?? null,
        },
      });
    }

    const listIds = (item.list_memberships ?? []).map((m) => m.affinity_list_entry_id);
    if (listIds.length > 0) {
      await this.prisma.affinityListMembership.deleteMany({
        where: { personUid: row.uid, affinityListEntryId: { in: listIds } },
      });
    }
    for (const m of item.list_memberships ?? []) {
      await this.prisma.affinityListMembership.upsert({
        where: { affinityListEntryId: m.affinity_list_entry_id },
        create: {
          affinityListId: m.affinity_list_id,
          affinityListEntryId: m.affinity_list_entry_id,
          listName: m.list_name,
          personUid: row.uid,
          listFields: (m.list_fields ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
        update: {
          affinityListId: m.affinity_list_id,
          listName: m.list_name,
          personUid: row.uid,
          companyUid: null,
          listFields: (m.list_fields ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
    }

    return { member: Boolean(memberLink), company: Boolean(primaryCompanyUid) };
  }
}
