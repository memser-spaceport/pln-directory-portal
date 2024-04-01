import { ChangeLogList, tagColors } from "apps/web-app/constants";


const ChangeLogs = (props: any) => {
  return (
    <div className="flex h-full w-full flex-col gap-10 p-5 rounded bg-white border border-[#e2e8f0]">
      {ChangeLogList.map((changeLog: any, index: number) => {
        const tagColor = tagColors.find(
          (item: any) => item.name === changeLog.tag
        ).color;
        return (
          <div
            className={`flex flex-col gap-3 pb-12  ${
              index !== ChangeLogList.length - 1
                ? 'border-b border-[#CBD5E1]'
                : ''
            }`}
            key={`changelog-${index}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-[500] text-[#0F172A]">
                {changeLog.date}
              </span>
              <span className="inline-flex h-[27px] items-center gap-1 rounded-3xl border border-[#CBD5E1] px-3 py-[6px]">
                <span
                  style={{ backgroundColor: tagColor }}
                  className="inline-block h-2 w-2 rounded-full"
                />
                <span className="text-xs text-[#475569]">{changeLog.tag}</span>
              </span>
            </div>
            <div className="flex flex-col gap-5">
              <h6 className="text-[24px] font-bold leading-5 text-[#0F172A]">
                {changeLog.title}
              </h6>
              <div
              className="pl-5"
                dangerouslySetInnerHTML={{ __html: changeLog.shortContent }}
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ChangeLogs;
