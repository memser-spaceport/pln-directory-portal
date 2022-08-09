import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { AppProps } from 'next/app';
import Head from 'next/head';
import Navbar from '../components/layout/navbar/navbar';
import { useFathom } from '../hooks/plugins/fathom.hook';
import './styles.css';

function CustomApp({ Component, pageProps }: AppProps) {
  // Load Fathom web analytics tracker
  useFathom();

  return (
    <>
      <Head>
        <title>Protocol Labs Network</title>
      </Head>
      <main className="app min-w-[1272px] pt-20">
        <Navbar />
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default CustomApp;
