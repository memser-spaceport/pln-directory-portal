import { ChangeEvent, useEffect, useState } from 'react';
import { InputField, Autocomplete } from '@protocol-labs-network/ui';
import { XIcon as CloseIcon } from '@heroicons/react/outline';
import { fetchTeamsForAutocomplete } from '../../../utils/services/dropdown-service';

// interface Team {
//   teamUid: string;
//   teamTitle: string;
// }

export function TeamAndRoleGrid(props) {
  const [teamRowId, setTeamRowId] = useState(props?.teamAndRole.rowId);
  const team= props?.teamAndRole;

  const teamNames = props.teamNames;

  function handleDropDownChange(selectedOption) {
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
    props.updateParentRoleValue(value, props?.teamAndRole.rowId);
  }

  return (
    <>
      <div className="flex flex-row">
        <div className="basis-6/12">
          <Autocomplete
            className="custom-grey custom-outline-none border truncate pr-[25px]"
            required={true}
            placeholder="Select a team"
            selectedOption={{ value: team?.teamUid, label: team?.teamTitle }}
            onSelectOption={handleDropDownChange}
            excludeValues={teamNames}
            debounceCall={fetchTeamsForAutocomplete}
          />
        </div>
        <div className="basis-5/12 pl-2">
          <InputField
            name="role"
            required={true}
            showLabel={false}
            label="Role"
            maxLength={100}
            placeholder="Enter your title/role"
            className="custom-grey custom-outline-none border"
            onChange={handleInputChange}
            value={team.role}
          />
        </div>
        <div className="basis-1/12 pl-3 pt-5 ">
          <div
            className={teamRowId > 1 ? `cursor-pointer` : `invisible`}
            onClick={() => props.handleDeleteRolesRow(teamRowId)}
          >
            <CloseIcon className="cross-icon" />
          </div>
        </div>
      </div>
    </>
  );
}
