import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { AppProps } from 'next/app';
import Head from 'next/head';
import './styles.css';
import { NavbarContextProvider } from '../context/navbar-context';
import withAuth from '../hoc/withauth';
import Toaster from '../components/common/toaster';


function CustomApp({ Component, pageProps }: AppProps) {
  // const getLayout = Component.getLayout ?? ((page) => page)

  return (
    <>
      <Head>
        <title>Welcome to back-office!</title>
      </Head>
      <main className="app app full-body absolute h-full w-full">
        <NavbarContextProvider>
          <Component {...pageProps} />
        </NavbarContextProvider>
        <Toaster />
      </main>
    </>
  );
}

export default CustomApp;
