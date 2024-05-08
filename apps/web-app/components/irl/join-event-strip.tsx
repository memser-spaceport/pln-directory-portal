import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';

const JoinEventStrip = (props: any) => {
  const onLogin = props?.onLogin;
  const isUserLoggedIn = props?.isUserLoggedIn;
  const isUserGoing = props?.isUserGoing;
  const eventDetails = props?.eventDetails;
  const user = getUserInfo();
  const analytics = useAppAnalytics();

  const onJoinClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_JOIN_EVENT_STRIP_IAM_GOING_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
        user,
      }
    );
    document.dispatchEvent(
      new CustomEvent('openRsvpModal', {
        detail: {
          isOpen: true,
        },
      })
    );
  };

  const onLoginClick = () => {
    analytics.captureEvent(
      APP_ANALYTICS_EVENTS.IRL_JOIN_EVENT_STRIP_LOGIN_BTN_CLICKED,
      {
        eventId: eventDetails?.id,
        eventName: eventDetails?.name,
      }
    );
    onLogin();
  };

  return (
    <>
      <div className="joinEventStrip">
        <div className="joinEventStrip__info">
          <img src="/assets/images/icons/stars.svg" alt="stars image" />
          <p className="joinEventStrip__info__text">
            Kickstart the attendee list and let others know you're joining. Your
            presence could inspire others to join in too!
          </p>
        </div>
        <div className="joinEventStrip__btnWrpr">
          {isUserLoggedIn && !isUserGoing && (
            <button
              onClick={onJoinClick}
              className="joinEventStrip__btnWrpr__btn"
            >
              I am going
            </button>
          )}
          {!isUserLoggedIn && (
            <button
              onClick={onLoginClick}
              className="joinEventStrip__btnWrpr__loginBtn"
            >
              Login to Respond
            </button>
          )}
        </div>
      </div>
      <style jsx>{`
        .joinEventStrip {
          display: flex;
          align-items: center;
          flex-direction: column;
          background-color: #ffffff;
          gap: 24px;
          padding: 20px;
          height: 100%;
          border-radius: 8px;
        }

        .joinEventStrip__info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 3;
        }

        .joinEventStrip__info__text {
          font-size: 15px;
          font-weight: 400;
          line-height: 24px;
          color: #0f172a;
        }

        .joinEventStrip__btnWrpr {
          width: 100%;
        }

        .joinEventStrip__btnWrpr {
          display: flex;
          justify-content: end;
        }

        .joinEventStrip__btnWrpr__btn {
          height: 40px;
          width: 100%;
          background-color: #156ff7;
          color: #ffffff;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          line-height: 20px;
          border: 1px solid #cbd5e1;
        }

        .joinEventStrip__btnWrpr__btn:hover {
          background-color: #1D4ED8;
        }

        .joinEventStrip__btnWrpr__loginBtn {
          width: 100%;
          background-color: #156ff7;
          box-shadow: 0px 1px 1px 0px #0f172a14;
          border: 1px solid #cbd5e1;
          height: 40px;
          font-size: 14px;
          font-weight: 500;
          color: #ffffff;
          line-height: 20px;
          border-radius: 8px;
        }

        .joinEventStrip__btnWrpr__loginBtn:hover {
          background-color: #1D4ED8;
        }

        @media (min-width: 1024px) {
          .joinEventStrip {
            flex-direction: row;
          }

          .joinEventStrip__btnWrpr__btn {
            width: 119px;
          }

          .joinEventStrip__btnWrpr {
            flex: 1;
          }

          .joinEventStrip__btnWrpr__loginBtn {
            width: 165px;
          }
        }
      `}</style>
    </>
  );
};

export default JoinEventStrip;
