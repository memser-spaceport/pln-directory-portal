import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import Cookies from 'js-cookie';
import type { NextPage } from 'next';
import { DefaultSeo } from 'next-seo';
import type { AppProps } from 'next/app';
import { ReactElement, useEffect, ReactNode} from 'react';
import { toast } from 'react-toastify';
import { useFathom } from '../hooks/plugins/use-fathom.hook';
import { DEFAULT_SEO } from '../seo.config';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles.css';
import { useRouter } from 'next/router';
import posthog from 'posthog-js';
import { logoutAllTabs } from '../utils/services/auth';

import { LOGIN_FAILED_MSG, LOGOUT_MSG, RETRY_LOGIN_MSG, LOGGED_IN_MSG, SOMETHING_WENT_WRONG } from '../constants';
import EmailOtpVerificationModal from '../components/auth/email-otp-verification-modal';

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
  useFathom();
  const router = useRouter()

  useEffect(() => {
    // Track page views
    const handleRouteChange = () => posthog?.capture('$pageview')
    router.events.on('routeChangeComplete', handleRouteChange)
    logoutAllTabs();
    Cookies.remove('state');
    const params = Cookies.get('page_params');
    switch (params) {
      case "auth_error":
        toast.error(LOGIN_FAILED_MSG, {
          hideProgressBar: true,
        });
        break;
      case "logout":
        toast.info(LOGOUT_MSG, {
          hideProgressBar: true
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
      default:
        break;
    }
    Cookies.remove('page_params');
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [])

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
    </>
  );
}