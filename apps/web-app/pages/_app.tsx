import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import type { NextPage } from 'next';
import { DefaultSeo } from 'next-seo';
import type { AppProps } from 'next/app';
import type { ReactElement } from 'react';
import { ReactNode } from 'react';
import { useFathom } from '../hooks/plugins/use-fathom.hook';
import { DEFAULT_SEO } from '../seo.config';
import './styles.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

  // Use the layout defined at the page level, if available
  const getLayout = Component.getLayout || ((page: ReactNode) => page);

  return getLayout(
    <>
      <DefaultSeo {...DEFAULT_SEO} />
      <Component {...pageProps} />
      <ToastContainer position="bottom-right" />
    </>
  );
}
