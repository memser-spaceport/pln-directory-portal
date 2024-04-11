'use client';

import { Fragment, useEffect, useState } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { UserGroupIcon } from '@heroicons/react/solid';
import { ReactComponent as DownArrow } from '/public/assets/images/icons/down-arrow-grey.svg';

export default function TeamsDropDown({
  options,
  initialOption,
  placeholder,
  getValue,
}: any) {

  const [selected, setSelected] = useState(initialOption);

  const handleChange = (value) => {
    setSelected(value);
    getValue(value);
  };

  useEffect(() => {
    setSelected(initialOption);
  }, [initialOption]);

  return (
    <Listbox value={selected} onChange={handleChange}>
      <div className="relative">
        <Listbox.Button className="relative h-[40px] w-full cursor-pointer rounded-lg border border-[#CBD5E1] bg-white py-2 pl-3 pr-10 text-left text-[#475569] focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 sm:text-sm">
          {selected ? (
            <div className="flex items-center gap-2">
              {selected.logo ? (
                <img
                  className="h-6 w-6 rounded-full"
                  src={selected.logo}
                  alt="logo"
                />
              ) : (
                <UserGroupIcon className="inset-y-0 left-2 my-auto mr-[4px] inline h-6 w-6 rounded-full bg-gray-200 fill-white" />
              )}
              <span className="block max-w-[100%] truncate">
                {selected.name}
              </span>
            </div>
          ) : (
            <div className="text-sm text-slate-600 opacity-50">
              {placeholder}
            </div>
          )}
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <DownArrow />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Listbox.Options className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
            {options.map((person, personIdx) => (
              <Listbox.Option
                key={personIdx}
                className={({ active }) =>
                  `relative cursor-pointer select-none py-2 pl-4 pr-4 text-gray-900 `
                }
                value={person}
              >
                {({ selected }) => (
                  <>
                    <div className="flex items-center gap-2">
                      {person.logo ? (
                        <img
                          className="h-6 w-6 rounded-full"
                          src={person.logo}
                          alt="logo"
                        />
                      ) : (
                        <UserGroupIcon className="inset-y-0 left-2 my-auto mr-[4px] inline h-6 w-6 rounded-full bg-gray-200 fill-white" />
                      )}
                      <span
                        className={`block truncate ${
                          selected ? 'font-medium' : 'font-normal'
                        }`}
                      >
                        {person.name}
                      </span>
                    </div>
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}
