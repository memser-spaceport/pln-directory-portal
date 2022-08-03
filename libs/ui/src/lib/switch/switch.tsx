import { Switch as HeadlessSwitch } from '@headlessui/react';
import { useCallback, useState } from 'react';

export interface SwitchProps {
  label?: string;
  initialValue?: boolean;
  onChange?: (enabled: boolean) => void;
}

export function Switch({ label, initialValue = false, onChange }: SwitchProps) {
  const [enabled, setEnabled] = useState(initialValue);

  const onSwitchChange = useCallback(
    (enabled: boolean) => {
      setEnabled(enabled);
      onChange?.(enabled);
    },
    [setEnabled, onChange]
  );

  return (
    <HeadlessSwitch.Group>
      <div className="flex items-center justify-between space-x-4">
        {label ? (
          <HeadlessSwitch.Label
            passive
            className="select-none text-sm text-slate-600"
          >
            {label}
          </HeadlessSwitch.Label>
        ) : null}
        <HeadlessSwitch
          checked={enabled}
          onChange={onSwitchChange}
          className={`${
            enabled ? 'bg-blue-600' : 'bg-slate-300'
          } h-4 w-7 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-1 focus:ring-blue-400`}
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
