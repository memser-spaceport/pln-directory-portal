import { MdEditor } from 'md-editor-rt';
import 'md-editor-rt/lib/style.css';
import { useEffect, useState } from "react";
import { MdPreview } from 'md-editor-rt';

export default function AdditionalDetails() {
    const [text, setText] = useState('# Hello Editor');

    const [showEditor, setEditorVisible] = useState(false);
    // const { response } = useMdViewer(text);

    useEffect(() => {
        console.log(text);
        console.log(typeof(text));
        
    }, [text])

    const onEditAction = () => {
        setEditorVisible(true)
    }

    const onCancelAction = () => {
        setEditorVisible(false)
    }

    const onSaveAction = (test) => {
        console.log(test);
        
        setEditorVisible(false)
    }
    return (
        <>
            <div className="flex justify-between">
                <div className="text-[14px] font-medium text-[#64748B] tracking-[1px]">
                    Additional Details
                </div>
                {
                    !showEditor && <div className="text-[#156FF7] text-[13px] font-medium cursor-pointer" onClick={onEditAction}>
                        Edit
                    </div>
                }
                {
                    showEditor && <div className='flex gap-[8px]'>
                        <div className="px-[16px] py-[8px] text-[#156FF7] rounded border border-[#156FF7] cursor-pointer" onClick={onCancelAction}>
                            Cancel
                        </div>
                        <div className="px-[16px] py-[8px] text-white bg-[#156FF7] rounded border border-[#156FF7] cursor-pointer">
                            Save 
                        </div>
                    </div>
                }
            </div>
            <div className='no-tailwind'>
                {/* <div dangerouslySetInnerHTML={{ __html: response }} /> */}
                {
                    !showEditor && <MdPreview modelValue={text} />
                }
            </div>
            {
                showEditor && <div>
                    <MdEditor modelValue={text} onChange={setText} language={'en-US'} onSave={onSaveAction} toolbarsExclude={['catalog','github']}/>
                </div>
            }


        </>
    )
}