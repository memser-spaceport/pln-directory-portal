import { Prisma } from '@prisma/client';

// Define the type for location with selected fields for events
export type PLEventLocationWithEvents = Prisma.PLEventLocationGetPayload<{
  include: {
    events: {
      select: {
        slugURL: true,
        uid: true,
        name: true;
        type: true;
        description: true;
        startDate: true;
        endDate: true;
        logo: true;
        banner: true;
        resources: true;
        additionalInfo: true;
      };
    };
  };
}>;

// Extract the event type from PLEventLocationWithEvents
export type PLEvent = PLEventLocationWithEvents['events'][number];

// Define the extended LocationWithEvents type with past and upcoming events
export type FormattedLocationWithEvents = PLEventLocationWithEvents & {
  pastEvents: PLEvent[];
  upcomingEvents: PLEvent[];
};
