export const PortalDivider = () => {
  return (
    <div className="relative h-[1px] bg-slate-100 opacity-80">
      <div className="bg-pln-gradient-02 absolute bottom-0 left-1/2 z-10 h-[1px] w-[327px] -translate-x-1/2 blur-[2px] md:w-[540px]"></div>
      <div className="bg-pln-gradient-02 absolute bottom-0 left-1/2 z-20 h-[1px] w-[327px] -translate-x-1/2 md:w-[540px]"></div>
    </div>
  );
};
