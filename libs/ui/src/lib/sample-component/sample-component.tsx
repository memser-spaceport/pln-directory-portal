import { Switch } from '@headlessui/react';
import { useState } from 'react';
import styles from './sample-component.module.scss';

/* eslint-disable-next-line */
export interface SampleComponentProps {}

export function SampleComponent(props: SampleComponentProps) {
  const [enabled, setEnabled] = useState(true);

  return (
    <div className={styles['container']}>
      <h1 className="text-2xl text-cyan-600 mb-2">
        Here's a sample toggle component{' '}
        <span role="img" aria-label="Pointing Down">
          👇
        </span>
      </h1>

      <Switch.Group>
        <div className="flex items-center">
          <Switch.Label passive className="mr-4">
            Enable notifications
          </Switch.Label>
          <Switch
            checked={enabled}
            onChange={setEnabled}
            className={`${
              enabled ? 'bg-green-600' : 'bg-gray-200'
            } relative inline-flex items-center h-6 rounded-full w-11 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600`}
          >
            <span
              className={`${
                enabled ? 'translate-x-6' : 'translate-x-1'
              } inline-block w-4 h-4 transform bg-white rounded-full transition-transform ease-in-out duration-200`}
            />
          </Switch>
        </div>
      </Switch.Group>
    </div>
  );
}

export default SampleComponent;
