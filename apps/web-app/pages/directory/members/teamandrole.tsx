import { ChangeEvent, useState } from 'react';
import { InputField, Dropdown } from '@protocol-labs-network/ui';
import { XIcon as CloseIcon } from '@heroicons/react/outline';

interface Team {
  teamUid: string;
  teamTitle: string;
}

export function TeamAndRoleGrid(props) {
  const [teamDetail, setTeamDetail] = useState<Team>(props?.teamAndRole.team);
  const [teamRowId, setTeamRowId] = useState(props?.teamAndRole.rowId);
  const [roleTitle, setRoleTitle] = useState(props?.teamAndRole.role);
  const team = props?.teamAndRole;
  const role = props?.teamAndRole.role;

  const dropDownValues = props.dropDownValues;

  function handleDropDownChange(selectedOption, name) {
    console.log('selectedOption', selectedOption);
    setTeamDetail(selectedOption);
    props.updateParentTeamValue(
      selectedOption.value,
      selectedOption.label,
      props?.teamAndRole.rowId
    );
  }

  function handleInputChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { value } = event.target;
    setRoleTitle(value);
    props.updateParentRoleValue(value, props?.teamAndRole.rowId);
  }

  return (
    <>
      <div className="flex pt-4 flex-row">
        <div className="basis-5/12">
          <Dropdown
            name="team"
            options={dropDownValues?.teamNames}
            initialOption={{
              value: teamDetail?.teamUid,
              label: teamDetail?.teamTitle,
            }}
            onChange={handleDropDownChange}
            value={{ value: team?.teamUid, label: team?.teamTitle }}
          />
        </div>
        <div className="pl-5 basis-5/12">
          <InputField
            name="role"
            showLabel={false}
            label="Role"
            placeholder="Enter Role"
            onChange={handleInputChange}
            value={roleTitle}
          />
        </div>
        <div
          className="basis-2/12 pl-3 pt-3"
          onClick={() => props.handleDeleteRolesRow(teamRowId)}
        >
          <CloseIcon className="h-5 w-5" />
        </div>
      </div>
    </>
  );
}
