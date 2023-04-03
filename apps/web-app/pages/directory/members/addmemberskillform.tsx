import { useState, useEffect, ChangeEventHandler } from 'react';
import { MultiSelect } from '@protocol-labs-network/ui';
import { TeamAndRoleGrid } from './teamandrole';

export default function AddMemberSkillForm(props) {
  const teamAndRoles = props?.formValues.teamAndRoles;
  const dropDownValues = props?.dropDownValues;

  return (
    <>
      <div className="px-8 py-4">
        <div className="flex pt-4 flex-row">
          <span className="basis-5/12">Team*</span>
          <span className="pl-5 basis-5/12">Role*</span>
        </div>
        {teamAndRoles.map((item, index) => (
          <TeamAndRoleGrid
            key={item.rowId}
            dropDownValues={dropDownValues}
            handleDeleteRolesRow={props.handleDeleteRolesRow}
            handleDropDownChange={props.handleDropDownChange}
            updateParentTeamValue={props.updateParentTeamValue}
            updateParentRoleValue={props.updateParentRoleValue}
            teamAndRole={item}
          />
        ))}
        <div>
          <button
            className="text-blue-500"
            onClick={props.handleAddNewRole}
          >
            + Add Role
          </button>
        </div>
      </div>
      <div className="px-8 py-4">
        <MultiSelect
          name="skills"
          options={dropDownValues.skillValues}
          selectedValues={props.formValues.skills}
          onChange={props.handleDropDownChange}
          placeholder="Enter the skills"
          label="Professional Skills"
        />
      </div>
    </>
  );
}
