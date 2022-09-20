import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { DefaultSeo } from 'next-seo';
import { AppProps } from 'next/app';
import Navbar from '../components/layout/navbar/navbar';
import { useFathom } from '../hooks/plugins/use-fathom.hook';
import { SEO } from '../seo.config';
import './styles.css';

function CustomApp({ Component, pageProps }: AppProps) {
  // Load Fathom web analytics tracker
  useFathom();

  return (
    <>
      <DefaultSeo {...SEO} />
      <main className="app min-w-[1272px] pt-20">
        <Navbar />
        <Component {...pageProps} />
      </main>
    </>
  );
}

export default CustomApp;
