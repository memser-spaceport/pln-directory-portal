import { Navbar } from '../components/navbar/navbar';

export function ApprovalLayout({ children }) {
  return (
    <div className="">
      <Navbar />
      <main className="overflow-y-auto bg-[#F5F6F7] pb-[80px]">{children}</main>
    </div>
  );
}
