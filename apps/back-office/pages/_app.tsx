import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { AppProps } from 'next/app';
import Head from 'next/head';
import './styles.css';
import '../styles/react-datepicker.min.css';
import { NavbarContextProvider } from '../context/navbar-context';
import Toaster from '../components/common/toaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function CustomApp({ Component, pageProps }: AppProps) {
  // const getLayout = Component.getLayout ?? ((page) => page)

  return (
    <>
      <Head>
        <title>Welcome to back-office!</title>
      </Head>
      <main className="app app full-body absolute h-full w-full">
        <QueryClientProvider client={queryClient}>
          <NavbarContextProvider>
            <Component {...pageProps} />
          </NavbarContextProvider>
        </QueryClientProvider>
        <Toaster />
      </main>
    </>
  );
}

export default CustomApp;
