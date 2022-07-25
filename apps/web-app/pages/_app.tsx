import { AppProps } from 'next/app';
import Head from 'next/head';
import Navbar from '../components/layout/navbar/navbar';
import './styles.css';

function CustomApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Protocol Labs Network</title>
      </Head>
      <main className="app">
        <Navbar />
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default CustomApp;
