import api from '../utils/api';
import { isPastDate } from '../utils/irl.utils';

export const getAllEvents = async () => {
  try {
    const response = await api.get(
      `${process.env.NEXT_PUBLIC_WEB_API_BASE_URL}/v1/irl/events?orderBy=-createdAt`
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
          isPastEvent: isPastDate(event?.endDate),
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
  const isPastEvent = isPastDate(output?.endDate);

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
    isPastEvent,
    resources:output?.resources,
    guests: output?.eventGuests?.map((guest: any) => {
      return {
        uid: guest?.uid,
        teamUid: guest?.teamUid,
        teamName: guest?.team?.name,
        teamLogo: guest?.team?.logo?.url,
        memberUid: guest?.memberUid,
        memberName: guest?.member?.name,
        memberLogo: guest?.member?.image?.url,
        reason: guest?.reason,
        telegramId: guest?.telegramId,
        createdAt:guest?.createdAt
      };
    }),
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
