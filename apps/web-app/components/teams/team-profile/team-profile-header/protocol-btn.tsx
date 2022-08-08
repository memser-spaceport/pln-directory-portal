type ProtocolBtnProps = {
  Icon: (props: React.ComponentProps<'svg'>) => JSX.Element;
};

export function ProtocolBtn({ Icon }: ProtocolBtnProps) {
  return (
    <span className="inline-flex h-10 w-10 rounded-full border border-slate-200 p-2 shadow-[0_1px_2px_rgba(15,23,42,0.16)]">
      <Icon className="h-6 w-6 self-center" />
    </span>
  );
}
