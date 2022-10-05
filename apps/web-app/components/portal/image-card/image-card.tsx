export type TImageCardProps = {
  imageURL: string;
  children?: React.ReactNode;
};

export function ImageCard({ imageURL, children }: TImageCardProps) {
  return (
    <div className="group cursor-default overflow-hidden rounded-lg">
      <div
        className="absolute z-0 h-full w-full bg-cover transition duration-[1200ms] ease-in-out group-hover:rotate-[-5deg] group-hover:scale-110"
        style={{ backgroundImage: `url(${imageURL})` }}
      ></div>
      <div className="absolute z-10 h-full w-full rounded-lg bg-gradient-to-b from-transparent via-slate-900/0 to-slate-900"></div>
      <div className="absolute z-20 h-full w-full">{children}</div>
    </div>
  );
}
