import useClickOutside from "apps/web-app/hooks/shared/use-click-outside";
import { useDebounce } from "apps/web-app/hooks/shared/use-debounce";
import { findProjectByName } from "apps/web-app/services/projects.service";
import { useEffect, useRef, useState } from "react"

function ProjectSelection(props) {
    const selectedProj = props?.selectedProj ?? null
    const inputRef = useRef<HTMLInputElement>(null);
    const [isPaneActive, setPaneStatus] = useState(false);
    const [searchText, setSearchText] = useState("")
    const searchQuery = useDebounce(searchText, 300);
    const [isLoading, setLoadingStatus] = useState(false);
    const [searchResult, setSearchResult] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const onProjectSelected = props.onProjectSelected;
    useClickOutside(inputRef, () => setPaneStatus(false))

    const onTextChange = (e) => {
        e.preventDefault();
        console.log(e.target.value)
        if(e.target.value === "") {
            onProjectSelected(null)
        }
        setSearchText(e.target.value)
    }

    const onItemSelected = (item) => {
        setSelectedItem(item)
        onProjectSelected(item);
        inputRef.current.value = item.name
        setSearchText(item.name)
        setPaneStatus(false)
    }

    const onInputClicked = (e) => {
        setLoadingStatus(true)
        findProjectByName(searchText)
            .then(d => {
                setSearchResult(d)
                setPaneStatus(true)
            })
            .catch(e => console.log(e))
            .finally(() => setLoadingStatus(false))
    }

    useEffect(() => {
        if (searchQuery !== '') {
            setLoadingStatus(true)
            findProjectByName(searchQuery)
                .then(d => {
                    setSearchResult(d);
                    setPaneStatus(true)
                })
                .catch(e => console.log(e))
                .finally(() => setLoadingStatus(false))
        }
    }, [searchQuery])

    useEffect(() => {
        if (selectedProj) {
            setSelectedItem(selectedProj)
            setSearchText(selectedProj.name)
            inputRef.current.value = selectedProj.name
        }
    }, [])

    return <>
        <div className="relative w-full flex gap-[8px] border-solid border-[1px] border-[#CBD5E1] px-[8px] py-[8px] rounded-[8px]">
            {(selectedItem && selectedItem.name === searchText) && <img className="w-[30px] rounded-[8px] h-[30px] object-cover object-center" src={selectedItem?.logo?.url} />}
            <input onClick={onInputClicked} placeholder="Search Projects by name" ref={inputRef} className="w-full outline-none border-none text-[14px]" onChange={onTextChange} type="text" />
            {(searchText !== selectedItem?.name && isPaneActive) && <div className="absolute top-[calc(100%_+_5px)] bg-white rounded-[8px] border-solid border-[1px] border-[#CBD5E1] flex justify-center items-center
         h-[120px] w-full left-0 right-0">
                {/*  {isLoading && <p className="text-[12px] px-[8px] py-[6px] w-full flex items-center justify-center">Searching for <span className="font-[700] ml-[4px]">{searchQuery}</span></p>} */}
                {(!isLoading && searchResult.length > 0) && <div className="w-full  h-full overflow-y-auto">
                    {searchResult.map((res, resIndex) => <div className="flex cursor-pointer  px-[8px] my-[8px]" onClick={() => onItemSelected(res)} key={`${resIndex}-pj-search`}>
                        <img className="w-[40px] rounded-[8px] h-[40px] object-cover object-center" src={res?.logo?.url} />
                        <p className="text-[13px] px-[16px] py-[8px]">{res.name}</p>
                    </div>)}
                </div>}
                {(!isLoading && searchResult.length === 0) && <p className="text-[14px] px-[8px] py-[6px] w-full flex items-center justify-center">No results found for <span className="font-[700] ml-[4px]">{searchQuery}</span></p>}
            </div>}
        </div>
    </>
}

export default ProjectSelection