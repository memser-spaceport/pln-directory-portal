import { Navbar } from '../components/layout/navbar/navbar';

export function DirectoryLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="min-w-[1272px] pt-20">{children}</main>
    </>
  );
}
