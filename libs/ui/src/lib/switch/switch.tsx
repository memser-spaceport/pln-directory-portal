import { Switch as HeadlessSwitch } from '@headlessui/react';
import { useCallback, useEffect, useState } from 'react';

export interface SwitchProps {
  label?: string;
  initialValue?: boolean;
  customClassName?: string;
  onChange?: (enabled: boolean) => void;
  nonEditable?: boolean
}

export function Switch({ label, initialValue = false, onChange, customClassName, nonEditable }: SwitchProps) {
  const [enabled, setEnabled] = useState(initialValue);

  useEffect(() => {
    setEnabled(initialValue);
  }, [setEnabled, initialValue]);

  const onSwitchChange = useCallback(
    (enabled: boolean) => {
      if(!nonEditable){
        setEnabled(enabled);
        onChange?.(enabled);
      }
    },
    [setEnabled, onChange]
  );

  return (
    <HeadlessSwitch.Group>
      <div className="flex items-center justify-between space-x-4">
        {label ? (
          <HeadlessSwitch.Label
            passive
            className={`select-none text-sm text-slate-600 ${customClassName ?? ''}`}
          >
            {label}
          </HeadlessSwitch.Label>
        ) : null}
        <HeadlessSwitch
          checked={enabled}
          onChange={onSwitchChange}
          className={`${
            enabled ? 'bg-blue-600' : 'bg-slate-300'
            } on-focus h-4 w-7 shrink-0 items-center rounded-full transition ${nonEditable ? `pointer-events-none focus:ring-0 focus:outline-none ${enabled ? 'bg-[#93C5FD] ' : 'bg-slate-300'}` : 'pointer-events-auto'}`}
          data-testid="switch__button"
        >
          <div
            className={`${
              enabled ? 'translate-x-3.5' : 'translate-x-0.5'
            } shadow-slate-900/16 h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform`}
          />
        </HeadlessSwitch>
      </div>
    </HeadlessSwitch.Group>
  );
}
