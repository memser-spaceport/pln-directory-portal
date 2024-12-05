

const Tab = (props: any) => {
    const name=props?.name ?? "";
    const isSelected =  props?.isSelected ?? false;
    const onTabClickHandler  = props?.onClick;
    const count = props?.count ?? 0;


    return (
        <button onClick={() => onTabClickHandler(name)} className={`px-[24px] py-[14px] border-b-[#CBD5E1]  border-b-[2px] text-[#1D4ED8] ${isSelected ? "border-b-[#1D4ED8] font-[600]" : ""}`}>{name} {`(${count})`}</button>
    )

}

export default Tab;