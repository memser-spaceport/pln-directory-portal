export function DirectoryCard({ isGrid, clickEv, children }) {
  return (
    <div
      className="bg-white border rounded-lg shadow-md text-sm px-6 pt-6 pb-4 min-w-[260px] cursor-pointer"
      onClick={clickEv}
    >
      {children}
    </div>
  );
}

export default DirectoryCard;
