import { ApolloProvider } from '@apollo/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { DefaultSeo } from 'next-seo';
import { AppProps } from 'next/app';
import Head from 'next/head';
import client from '../apollo-client';
import Navbar from '../components/layout/navbar/navbar';
import { useFathom } from '../hooks/plugins/use-fathom.hook';
import { SEO } from '../seo.config';
import './styles.css';

function CustomApp({ Component, pageProps }: AppProps) {
  // Load Fathom web analytics tracker
  useFathom();

  return (
    <ApolloProvider client={client}>
      <Head>
        <meta name="viewport" content="width=1272, user-scalable=no" />
        <meta content="#f1f5f9" name="theme-color"></meta>
      </Head>
      <DefaultSeo {...SEO} />
      <main className="app min-w-[1272px] pt-20">
        <Navbar />
        <Component {...pageProps} />
      </main>
    </ApolloProvider>
  );
}

export default CustomApp;
