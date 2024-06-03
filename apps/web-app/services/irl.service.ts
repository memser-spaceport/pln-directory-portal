import api from '../utils/api';
import { isPastDate } from '../utils/irl.utils';

export const getAllEvents = async () => {
  try {
    const response = await api.get(
      `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events?orderBy=priority`
    );

    if (response.status === 200) {
      const events = response?.data?.map((event: any) => {
        return {
          id: event?.uid,
          name: event?.name,
          slugUrl: event?.slugURL,
          bannerUrl: event?.banner?.url,
          description: event?.description,
          location: event?.location,
          startDate: event?.startDate,
          endDate: event?.endDate,
          createdAt: event?.createdAt,
          type: event?.type,
          attendees: event?.eventGuests?.length,
          priority: event?.priority,
        };
      });

      return events;
    } else {
      throw new Error(`Unexpected status code: ${response.status}`);
    }
  } catch (error) {
    if (error.response) {
      const { status, data } = error.response;
      return {
        errorCode: status,
        errorMessage: data.message || 'Something went wrong!',
      };
    } else {
      return { errorCode: 500, errorMessage: 'Something went wrong' };
    }
  }
};

export const getEventDetailBySlug = async (slug, token) => {
  let result;
  try {
    result = await api.get(
      `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events/${slug}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    if (e.response?.status) {
      return {
        errorCode: 404,
      };
    } else {
      return {
        errorCode: 500,
      };
    }
  }

  const output = result.data;
  // const isPastEvent = isPastDate(output?.endDate);
  // const eventExclusions = process.env.IRL_TELEGRAM_EXCLUSIONS;
  
  // const eventExclusionIds = eventExclusions?.split(',');
  // const isExclusionEvent = eventExclusionIds?.includes(output?.uid);

  const isExclusionEvent = output?.additionalInfo?.isExclusiveEvent ?? false;
  const topics = output?.additionalInfo?.topics ?? [];

  const guests = output?.eventGuests?.map((guest: any) => {
    const memberRole = guest?.member?.teamMemberRoles?.find(
      (teamRole) => guest?.teamUid === teamRole?.teamUid
    )?.role;

    const projectContributions = guest?.member?.projectContributions.map(
      (item) => item?.project?.name
    );

    return {
      uid: guest?.uid,
      teamUid: guest?.teamUid,
      teamName: guest?.team?.name,
      teamLogo: guest?.team?.logo?.url,
      memberUid: guest?.memberUid,
      memberName: guest?.member?.name,
      memberLogo: guest?.member?.image?.url,
      memberRole,
      reason: guest?.reason,
      telegramId: guest?.telegramId,
      createdAt: guest?.createdAt,
      projectContributions,
      topics: guest?.topics,
      additionalInfo: guest?.additionalInfo,
    };
  });

  return {
    id: output?.uid,
    name: output?.name,
    slugUrl: output?.slugURL,
    bannerUrl: output?.banner?.url,
    eventCount: output?.eventsCount,
    description: output?.description,
    websiteUrl: output?.websiteURL,
    telegram: output?.telegramId,
    type: output?.type,
    startDate: output?.startDate,
    endDate: output?.endDate,
    eventLocation: output?.location,
    // isPastEvent,
    resources: output?.resources,
    guests,
    topics,
    isExclusionEvent,
    additionalInfo: output?.additionalInfo,
  };
};

export const createEventGuest = async (slug, payload) => {
  const result = await api.post(
    `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events/${slug}/guest`,
    payload
  );

  return result;
};

export const editEventGuest = async (slug, uid, payload) => {
  const result = await api.put(
    `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events/${slug}/guest/${uid}`,
    payload
  );

  return result;
};

export const getUserEvents = async (token) => {
  try {
    const response = await api.get(
      `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/me/events`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response?.data;
  } catch (err) {
    if (err.response?.status) {
      return {
        errorCode: 404,
      };
    } else {
      return {
        errorCode: 500,
      };
    }
  }
};
