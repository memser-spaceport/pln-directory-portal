export default function KPIs({ project }) {
    return (
        <>
            {
                project?.kpis?.length > 0 && (
                    <div className="flex flex-col gap-[8px]">
                        <div className="text-[#64748B] text-[14px] font-medium tracking-[1px]">
                            KPIs
                        </div>
                        <div className="flex gap-[10px]">
                            {
                                project?.kpis.map((kpi, index) => {
                                    return (
                                        <div
                                            key={index}
                                            className="p-[10px] h-[88px] flex flex-col rounded border border-[#E2E8F0] w-full justify-center items-center min-w-[163px]">
                                            <div className="text-[24px] font-bold">
                                                {kpi.value}
                                            </div>
                                            <div className="text-[#64748B] text-[13px] leading-[18px] text-center">
                                                {kpi.key}
                                            </div>
                                        </div>
                                    )
                                })
                            }
                        </div>
                    </div>
                )
            }
        </>
    );
}