import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import useAppAnalytics from 'apps/web-app/hooks/shared/use-app-analytics';
import { getUserInfo } from 'apps/web-app/utils/shared.utils';
import { useEffect, useState } from 'react';

const ScrollToTop = (props:any) => {
  const pageName = props?.pageName;
  const analytics = useAppAnalytics();
  const user = getUserInfo();
  const [showTopBtn, setShowTopBtn] = useState(false);

  useEffect(() => {
    const handler = () => {
      if (window.scrollY > 400) {
        setShowTopBtn(true);
      } else {
        setShowTopBtn(false);
      }
    };
    window.addEventListener('scroll', handler);

    return () => {
      window.removeEventListener('scroll', handler);
    };
  }, []);

  const scrollToTop = () => {
    analytics.captureEvent(APP_ANALYTICS_EVENTS.GO_TO_TOP_BTN_CLICKED, {
      pageName,
      user,
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <>
      {showTopBtn && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-[27px] right-[17px] z-10 flex items-center gap-1 rounded-[68px] border border-[#156FF7] bg-[#FFFFFF] px-5 py-2 text-sm font-[500] text-[#0F172A] lg:hidden"
        >
          <img src="/assets/images/icons/up-arrow-black.svg" alt="arrow" />
          Go to Top
        </button>
      )}
    </>
  );
};

export default ScrollToTop;
