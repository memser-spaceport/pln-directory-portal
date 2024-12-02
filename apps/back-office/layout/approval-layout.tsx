import { Navbar } from '../components/navbar/navbar';

export function ApprovalLayout({ children }) {
  return (
    <div className="">
      <Navbar />
      <main className="overflow-y-auto bg-gray-200 pb-[80px]">
        {children}
      </main>
    </div>
  );
}
