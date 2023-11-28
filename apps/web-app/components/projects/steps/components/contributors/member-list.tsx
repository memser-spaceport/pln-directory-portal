import MemberRow from "./member-row";

export default function MemberList({ list, selectedMembers, setSelectedMembers }) {

    const onselect = (member) => {
        console.log(selectedMembers);
        if (checkForExistance(member) === 'no-data') {
            setSelectedMembers([...selectedMembers, member]);
        }
    }

    const onDeselect = (member) => {
        console.log(selectedMembers);
        const checker = checkForExistance(member);
        if (checker !== 'no-data') {
            const temp = [...selectedMembers];
            temp.splice(checker, 1);
            setSelectedMembers([...temp]);
        }
    }

    const checkForExistance = (member) => {
        for (let index = 0; index < selectedMembers.length; index++) {
            const mem = selectedMembers[index];
            if (mem.uid === member.uid) {
                return index;
            }
        }
        return 'no-data';
    }

    return (
        <div className="flex flex-col gap-3">
            {
                list && list.map((member, index) => {
                    return <MemberRow key={member + index}
                        data={member}
                        onselect={onselect}
                        onDeselect={onDeselect}
                        defaultValue={checkForExistance(member) !== 'no-data'}
                    />
                })
            }
        </div>
    );
}