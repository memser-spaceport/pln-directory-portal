import { Navbar } from '../components/navbar/navbar';

export function ApprovalLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="h-[84%] overflow-y-auto">{children}</main>
    </>
  );
}
