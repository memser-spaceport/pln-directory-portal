// FEATURE-ENV ONLY — never merge (branch lab-3247-env-seed only).
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

/**
 * FEATURE-ENV ONLY — never merge. Lives on the unmerged branch `lab-3247-env-seed`, never on lab-3247/develop.
 *
 * Dev has two upcoming events, both without pictures, links, access, mode, tags or hosts, so the All Events page
 * (LAB-3247) can't be tested or design-reviewed on its feature env. On start, when FEATURE_ENV_SEED_EVENTS=true, this
 * writes a set of made-up upcoming events into existing dev locations: several in one city (a multi-event map pin),
 * multi-day, hybrid, online, invite-only and paid, with tags, hosts, an agenda, a website or a "Registration"
 * resource, pictures reused from past dev events, and a few going members for faces and counts.
 *
 * Idempotent: every row has a fixed uid (`env-seed-…`) and is upserted on each start, with dates counted from today,
 * so the events stay upcoming across redeploys. `externalId` stays null, so the events sync, which only deletes
 * stale rows that came from the events service, never touches them. Writes only to this env's own Postgres copy.
 */

const DAY = 24 * 60 * 60 * 1000;

type SeedEvent = {
  key: string;
  name: string;
  city: string; // an existing PLEventLocation.location
  type: 'IN_PERSON' | 'VIRTUAL' | 'INVITE_ONLY';
  format: 'IN_PERSON' | 'VIRTUAL' | 'HYBRID';
  access: 'FREE' | 'PAID' | 'INVITE ONLY';
  inDays: number; // start, counted from today (UTC midnight)
  startHourUtc: number;
  hours: number; // length; over 24 makes it multi-day
  tags: { name: string; color: string }[];
  host: string;
  coHosts?: string[];
  website?: string;
  registration?: string;
  mapQuery?: string; // the venue search behind details.locationUrl (LAB-3332); none = no map link
  agenda?: boolean;
  going: number; // members to mark as going
  description: string;
};

const TAG = {
  ai: { name: 'AI', color: '#7C3AED' },
  ipfs: { name: 'IPFS', color: '#0EA5E9' },
  filecoin: { name: 'Filecoin', color: '#2563EB' },
  depin: { name: 'DePIN', color: '#059669' },
  crypto: { name: 'Cryptography', color: '#DB2777' },
  founders: { name: 'Founders', color: '#EA580C' },
  research: { name: 'Research', color: '#4F46E5' },
};

const EVENTS: SeedEvent[] = [
  {
    key: 'berlin-meetup',
    mapQuery: 'Factory Berlin Mitte, Berlin',
    name: 'PL Berlin Builders Meetup',
    city: 'Berlin',
    type: 'IN_PERSON',
    format: 'IN_PERSON',
    access: 'FREE',
    inDays: 1,
    startHourUtc: 17,
    hours: 3,
    tags: [TAG.ipfs, TAG.founders],
    host: 'Protocol Labs',
    website: 'https://lu.ma/env-seed-berlin-meetup',
    going: 5,
    description: 'An evening of short demos from teams building on IPFS and Filecoin, followed by drinks.',
  },
  {
    key: 'berlin-workshop',
    mapQuery: 'Betahaus Kreuzberg, Berlin',
    name: 'IPFS Hands-on Workshop',
    city: 'Berlin',
    type: 'IN_PERSON',
    format: 'IN_PERSON',
    access: 'PAID',
    inDays: 2,
    startHourUtc: 8,
    hours: 32, // two days
    tags: [TAG.ipfs],
    host: 'IPFS Foundation',
    coHosts: ['Interplanetary Shipyard'],
    registration: 'https://lu.ma/env-seed-ipfs-workshop',
    agenda: true,
    going: 2,
    description: 'Two days of guided labs: content addressing, gateways, and running your own node.',
  },
  {
    key: 'berlin-research',
    mapQuery: 'Silent Green Kulturquartier, Berlin',
    name: 'Filecoin Research Day',
    city: 'Berlin',
    type: 'INVITE_ONLY',
    format: 'HYBRID',
    access: 'INVITE ONLY',
    inDays: 9,
    startHourUtc: 9,
    hours: 8,
    tags: [TAG.filecoin, TAG.research, TAG.crypto],
    host: 'CryptoNet',
    website: 'https://example.org/env-seed-research-day',
    going: 0,
    description: 'Talks on proofs, storage markets and retrieval. In the room in Berlin and streamed online.',
  },
  {
    key: 'singapore-dinner',
    mapQuery: 'Marina Bay Sands, Singapore',
    name: 'Singapore Founders Dinner',
    city: 'Singapore',
    type: 'INVITE_ONLY',
    format: 'IN_PERSON',
    access: 'INVITE ONLY',
    inDays: 4,
    startHourUtc: 11,
    hours: 3,
    tags: [TAG.founders],
    host: 'PL Network',
    going: 3,
    description: 'A small dinner for founders in the network who are in Singapore this week.',
  },
  {
    key: 'tokyo-summit',
    mapQuery: 'Tokyo International Forum, Tokyo',
    name: 'Decentralized Tokyo Summit',
    city: 'Tokyo',
    type: 'IN_PERSON',
    format: 'IN_PERSON',
    access: 'PAID',
    inDays: 14,
    startHourUtc: 0,
    hours: 56, // three days
    tags: [TAG.ai, TAG.depin, TAG.ipfs],
    host: 'Protocol Labs',
    coHosts: ['Filecoin Foundation'],
    website: 'https://example.org/env-seed-tokyo-summit',
    agenda: true,
    going: 4,
    description: 'Three days of talks and workshops on decentralized AI, DePIN and open data.',
  },
  {
    key: 'sf-ai-night',
    mapQuery: 'Shack15, Ferry Building, San Francisco',
    name: 'Decentralized AI Night',
    city: 'San Francisco',
    type: 'IN_PERSON',
    format: 'HYBRID',
    access: 'FREE',
    inDays: 6,
    startHourUtc: 1,
    hours: 3,
    tags: [TAG.ai],
    host: 'PL Network',
    registration: 'https://lu.ma/env-seed-ai-night',
    going: 1,
    description: 'Lightning talks from teams training and serving models on open infrastructure.',
  },
  {
    key: 'dubai-breakfast',
    name: 'Builders Breakfast Dubai',
    city: 'Dubai',
    type: 'IN_PERSON',
    format: 'IN_PERSON',
    access: 'FREE',
    inDays: 11,
    startHourUtc: 5,
    hours: 2,
    tags: [TAG.founders],
    host: 'PL Network',
    going: 0,
    description: 'Coffee and introductions before the conference day starts.',
  },
  {
    key: 'buenos-aires-week',
    mapQuery: 'Centro Cultural Kirchner, Buenos Aires',
    name: 'Lab Week Buenos Aires',
    city: 'Buenos Aires',
    type: 'IN_PERSON',
    format: 'IN_PERSON',
    access: 'FREE',
    inDays: 21,
    startHourUtc: 12,
    hours: 104, // five days
    tags: [TAG.ipfs, TAG.filecoin, TAG.ai, TAG.depin],
    host: 'Protocol Labs',
    website: 'https://example.org/env-seed-lab-week',
    agenda: true,
    going: 6,
    description: 'A week of co-working, talks and side events across the city.',
  },
  {
    key: 'bangkok-depin',
    mapQuery: 'True Digital Park, Bangkok',
    name: 'DePIN Day Bangkok',
    city: 'Bangkok',
    type: 'IN_PERSON',
    format: 'HYBRID',
    access: 'PAID',
    inDays: 26,
    startHourUtc: 2,
    hours: 7,
    tags: [TAG.depin],
    host: 'DePIN Alliance',
    registration: 'https://lu.ma/env-seed-depin-day',
    going: 0,
    description: 'Hardware, incentives and real-world networks: a day of talks and demos.',
  },
  {
    key: 'online-office-hours',
    name: 'Filecoin Office Hours (online)',
    city: 'Others', // the events app's catch-all gathering; the page shows no city for it
    type: 'VIRTUAL',
    format: 'VIRTUAL',
    access: 'FREE',
    inDays: 3,
    startHourUtc: 15,
    hours: 1,
    tags: [TAG.filecoin],
    host: 'Filecoin Foundation',
    website: 'https://example.org/env-seed-office-hours',
    going: 0,
    description: 'Bring your questions about storage deals and onboarding data. Join from anywhere.',
  },
  {
    key: 'online-crypto-reading',
    name: 'Cryptography Reading Group',
    city: 'Others', // the events app's catch-all gathering; the page shows no city for it
    type: 'VIRTUAL',
    format: 'VIRTUAL',
    access: 'INVITE ONLY',
    inDays: 8,
    startHourUtc: 16,
    hours: 2,
    tags: [TAG.crypto, TAG.research],
    host: 'CryptoNet',
    going: 0,
    description: 'This week: a close reading of a recent paper on succinct proofs.',
  },
];

const ACCESS_OPTION: Record<SeedEvent['access'], string> = {
  FREE: 'FREE w/ RSVP',
  PAID: 'PAID',
  'INVITE ONLY': 'INVITE ONLY',
};

@Injectable()
export class EnvSeedEventsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnvSeedEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.FEATURE_ENV_SEED_EVENTS !== 'true') return;
    try {
      await this.seed();
    } catch (error) {
      // A seed failure must never stop the API from starting.
      this.logger.error(`[env-seed] events seed failed: ${(error as Error)?.message}`, (error as Error)?.stack);
    }
  }

  private async seed() {
    const locations = await this.prisma.pLEventLocation.findMany({
      where: { isDeleted: false, location: { in: [...new Set(EVENTS.map((e) => e.city))] } },
      select: { uid: true, location: true },
    });
    const locationByCity = new Map(locations.map((l) => [l.location, l.uid]));

    // Pictures: banners and logos that past dev events already use (they live on dev's S3).
    const pictured = await this.prisma.pLEvent.findMany({
      where: { OR: [{ bannerUid: { not: null } }, { logoUid: { not: null } }] },
      select: { bannerUid: true, logoUid: true },
      orderBy: { startDate: 'desc' },
      take: 200,
    });
    const pictures = [...new Set(pictured.map((p) => p.bannerUid ?? p.logoUid).filter((u): u is string => !!u))];

    // Going members: active members with a picture, so faces show.
    const members = await this.prisma.member.findMany({
      where: { deletedAt: null, imageUid: { not: null }, NOT: { memberApproval: { state: 'REJECTED' } } },
      select: { uid: true },
      orderBy: { createdAt: 'asc' },
      take: 12,
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let written = 0;

    for (const [index, e] of EVENTS.entries()) {
      const locationUid = locationByCity.get(e.city);
      if (!locationUid) {
        this.logger.warn(`[env-seed] no location "${e.city}"; "${e.name}" skipped`);
        continue;
      }
      const uid = `env-seed-ev-${e.key}`;
      const start = new Date(today.getTime() + e.inDays * DAY + e.startHourUtc * 60 * 60 * 1000);
      const end = new Date(start.getTime() + e.hours * 60 * 60 * 1000);
      const picture = pictures.length ? pictures[index % pictures.length] : null;
      const details = {
        tags: e.tags,
        accessType: null,
        accessOption: ACCESS_OPTION[e.access],
        format: e.format,
        host: { name: e.host, logo: null },
        coHosts: (e.coHosts ?? []).map((name) => ({ name, logo: null })),
        sponsors: [],
        agenda: e.agenda ? { sessions: this.agenda(start, e.hours) } : null,
        // LAB-3332: the drawer links the address to this map; events without mapQuery keep it plain text.
        locationUrl: e.mapQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.mapQuery)}`
          : null,
      };
      const data = {
        name: e.name,
        type: e.type,
        description: `<p>${e.description}</p><p>Made-up event, seeded for testing the All Events page on this feature environment.</p>`,
        shortDescription: e.description,
        websiteURL: e.website ?? null,
        resources: (e.registration
          ? [{ name: 'Registration', link: e.registration, type: 'website', isPrivate: false }]
          : []) as Prisma.InputJsonValue[],
        additionalInfo: { details } as Prisma.InputJsonObject,
        startDate: start,
        endDate: end,
        isDeleted: false,
        externalId: null,
        locationUid,
        bannerUid: picture,
        logoUid: picture,
      };
      await this.prisma.pLEvent.upsert({
        where: { uid },
        create: { uid, slugURL: uid, ...data },
        update: data,
      });

      // Seeded going members; a tester's own going mark on a seeded event is never touched.
      const goers = members.slice(index % 3, (index % 3) + e.going);
      const keep = goers.map((_, i) => `env-seed-g-${e.key}-${i}`);
      await this.prisma.pLEventGuest.deleteMany({
        where: { eventUid: uid, AND: [{ uid: { startsWith: 'env-seed-g-' } }, { uid: { notIn: keep } }] },
      });
      for (const [i, member] of goers.entries()) {
        const guestUid = keep[i];
        const guest = { memberUid: member.uid, locationUid, eventUid: uid, isHost: i === 0, showOnProfile: true };
        await this.prisma.pLEventGuest.upsert({
          where: { uid: guestUid },
          create: { uid: guestUid, ...guest },
          update: guest,
        });
      }
      written++;
    }

    this.logger.log(
      `[env-seed] ${written}/${EVENTS.length} events upserted; ${pictures.length} pictures, ${members.length} members available`
    );
  }

  /** A few sessions per day, starting at the event's start time. */
  private agenda(start: Date, hours: number) {
    const days = Math.max(1, Math.ceil(hours / 24));
    const titles = ['Welcome and keynote', 'Panel: building in the open', 'Workshops', 'Closing demos'];
    const sessions: { name: string; start: string; end: string; description?: string }[] = [];
    for (let d = 0; d < days; d++) {
      titles.forEach((name, i) => {
        const s = new Date(start.getTime() + d * DAY + i * 90 * 60 * 1000);
        sessions.push({
          name: days > 1 ? `${name} (day ${d + 1})` : name,
          start: s.toISOString(),
          end: new Date(s.getTime() + 75 * 60 * 1000).toISOString(),
          ...(i === 1 ? { description: 'Speakers from teams across the network.' } : {}),
        });
      });
    }
    return sessions;
  }
}
