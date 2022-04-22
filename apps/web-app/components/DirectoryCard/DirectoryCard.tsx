export interface DirectoryCardProps {
  isGrid?: boolean;
  clickEv?: any;
  children: React.ReactChild | React.ReactChild[];
}

export function DirectoryCard({
  isGrid,
  clickEv,
  children,
}: DirectoryCardProps) {
  return (
    <div className="bg-white border rounded-lg shadow-md text-sm px-6 pt-6 pb-4">
      {children}
    </div>
  );
}

export default DirectoryCard;
