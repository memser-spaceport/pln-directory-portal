import { AppProps } from 'next/app';
import Head from 'next/head';
import './styles.css';
import { NavbarContextProvider } from '../context/navbar-context';
import withAuth from '../hoc/withauth';

// export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
//   getLayout?: (page: ReactElement) => ReactNode
// }

// type AppPropsWithLayout = AppProps & {
//   Component: NextPageWithLayout
// }

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
      </main>
    </>
  );
}

export default withAuth(CustomApp);
