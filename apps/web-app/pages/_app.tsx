import { AppProps } from 'next/app';
import Head from 'next/head';
import Navbar from '../components/Navbar/Navbar';
import './styles.css';

function CustomApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Protocol Labs Network</title>
      </Head>
      <Navbar />
      <main className="app">
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default CustomApp;
