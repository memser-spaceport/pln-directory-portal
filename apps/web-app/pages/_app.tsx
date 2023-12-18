import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import Cookies from 'js-cookie';
import type { NextPage } from 'next';
import { DefaultSeo } from 'next-seo';
import type { AppProps } from 'next/app';
import { ReactElement, useEffect, useState, ReactNode} from 'react';
import { toast } from 'react-toastify';
import { useFathom } from '../hooks/plugins/use-fathom.hook';
import { DEFAULT_SEO } from '../seo.config';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import "react-responsive-carousel/lib/styles/carousel.min.css";
import './styles.css';
import { useRouter } from 'next/router';
import posthog from 'posthog-js';
import { LOGIN_FAILED_MSG, LOGOUT_MSG, RETRY_LOGIN_MSG, LOGIN_MSG, LOGGED_IN_MSG, SOMETHING_WENT_WRONG, EMAIL_CHANGED, PAGE_ROUTES } from '../constants';
import EmailOtpVerificationModal from '../components/auth/email-otp-verification-modal';
import { VerifyEmailModal } from '../components/layout/navbar/login-menu/verify-email-modal';
import { ReactComponent as SuccessIcon } from '../public/assets/images/icons/success.svg';
import { logoutAllTabs } from '../utils/services/auth';
import { decodeToken } from '../utils/services/auth';
import { cookiePrefix } from "../utils/common.utils";
// Check that PostHog is client-side (used to handle Next.js SSR)
if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    // Enable debug mode in development
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') posthog.debug()
    }
  })
}

/* eslint-disable-next-line @typescript-eslint/ban-types */
export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

export default function CustomApp({
  Component,
  pageProps,
}: AppPropsWithLayout) {
  // Load Fathom web analytics tracker
  const [isOpen, setIsModalOpen] = useState(false);
  useFathom();
  const router = useRouter()

  useEffect(() => {
    // Track page views
    const handleRouteChange = () => posthog?.capture('$pageview');
    router.events.on('routeChangeComplete', handleRouteChange);
    const isVerified = Cookies.get(`${cookiePrefix()}verified`);
    const params = Cookies.get(`${cookiePrefix()}page_params`);
    if(isVerified === 'true') {
      toast.success(LOGIN_MSG, {
        icon: <SuccessIcon />
      });
    } else if (isVerified === 'false') {
      setIsModalOpen(true);
    }
    logoutAllTabs();
    switch (params) {
      case "auth_error":
        toast.error(LOGIN_FAILED_MSG, {
          hideProgressBar: true,
        });
        break;
      case "user_logged_out":
        toast.info(RETRY_LOGIN_MSG, {
          hideProgressBar: true
        });
        break;
      case "user_logged_in":
        toast.info(LOGGED_IN_MSG + '.', {
          hideProgressBar: true
        });
        break;
      case "server_error":
        toast.info(SOMETHING_WENT_WRONG, {
          hideProgressBar: true
        });
        break;
      case "email_changed":
        toast.info(EMAIL_CHANGED, {
          hideProgressBar: true
        });
        break;
      default:
        break;
    }
    Cookies.remove(`${cookiePrefix()}page_params`);
    Cookies.remove(`${cookiePrefix()}verified`);
    Cookies.remove(`${cookiePrefix()}state`);
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

  useEffect(() => {
    const intervalEnv: any = process.env.NEXT_PUBLIC_TOKEN_EXPIRY_CHECK_IN_MINUTES;
    const interval = !isNaN(intervalEnv) ? intervalEnv * 60 * 1000 : 60 * 60 * 1000;
    console.log(`Token interval from env: ${interval}`); 
    const intervalId = setInterval(() => {
      const refreshToken = Cookies.get(`${cookiePrefix()}refreshToken`);
      // Check cookie on every one hour and refresh the page if it doesn't exist.
      console.log(`Token expiry checked at: ${new Date()}`);
      console.log(`${refreshToken ? 'Token will be expired at:' + new Date(decodeToken(JSON.parse(refreshToken))?.exp * 1000) : "Token expired!"}`)
      if (!refreshToken) {
        window.location.reload();
      }
    }, interval);

    return () => {
      // Clear the interval when the component unmounts
      clearInterval(intervalId);
    };
  }, []);

  // Use the layout defined at the page level, if available
  const getLayout = Component.getLayout || ((page: ReactNode) => page);

  return getLayout(
    <>
      <DefaultSeo {...DEFAULT_SEO} />
      <Component {...pageProps} />
      <ToastContainer
        position="top-right"
        theme="dark"
        bodyClassName="text-sm"
        className="!top-20"
        toastClassName="!rounded-md !bg-[#1E293B]"
        progressClassName="!bg-[#30C593]"
      />
      <EmailOtpVerificationModal/>
      <VerifyEmailModal
        isOpen={isOpen}
        setIsModalOpen={(isOpen) => {
          setIsModalOpen(isOpen);
          router.push(PAGE_ROUTES.TEAMS);
        }}
      />
    </>
  );
}
