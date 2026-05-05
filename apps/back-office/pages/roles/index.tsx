import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/access-control',
    permanent: false,
  },
});

export default function LegacyRolesPage() {
  return null;
}
