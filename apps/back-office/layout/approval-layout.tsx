import { Navbar } from '../components/navbar/navbar';

export function ApprovalLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="h-[84%] min-w-[1272px] overflow-y-auto">{children}</main>
    </>
  );
}
