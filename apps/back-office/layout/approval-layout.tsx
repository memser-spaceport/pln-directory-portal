import { Navbar } from '../components/navbar/navbar';

export function ApprovalLayout({ children }) {
  return (
    <div className="overflow-y-hidden">
      <Navbar />
      <main className="h-[900px] overflow-y-auto bg-gray-200 pb-[80px]">
        {children}
      </main>
    </div>
  );
}
