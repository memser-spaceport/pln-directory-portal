import { GetServerSideProps } from 'next';

export default function Index() {
  return <h1>Network Portal</h1>;
}

export const getServerSideProps: GetServerSideProps = async () => {
  return process.env.NEXT_PUBLIC_HIDE_NETWORK_PORTAL
    ? {
        redirect: {
          permanent: false,
          destination: '/directory/teams',
        },
      }
    : { props: {} };
};
