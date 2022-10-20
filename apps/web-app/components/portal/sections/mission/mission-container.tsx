type TMissionContainerProps = {
  children: React.ReactNode;
};

export const MissionContainer = ({ children }: TMissionContainerProps) => {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden bg-[url('/assets/images/portal/mission-bg.jpg')] bg-cover bg-center bg-no-repeat bg-origin-border px-6 pt-[104px] pb-10 text-center sm:px-16 sm:pb-[152px] sm:pt-48">
      <div className="absolute -top-6 -left-40 z-0 h-[474px] w-[372px] bg-[url('/assets/images/portal/left-cube.svg')] sm:bottom-14 sm:left-0 sm:top-auto"></div>
      <div className="absolute -right-20 -bottom-12 z-0 h-[260px] w-[318px] bg-[url('/assets/images/portal/right-cube.svg')] sm:right-11"></div>
      <div className="mx-auto max-w-[1110px]">{children}</div>
    </section>
  );
};
