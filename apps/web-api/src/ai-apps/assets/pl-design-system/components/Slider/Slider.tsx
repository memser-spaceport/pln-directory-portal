'use client';

import { useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import clsx from 'clsx';
import type { SliderProps } from './Slider.types';
import styles from './Slider.module.scss';

export function Slider({
  color = 'blue',
  size = 'md',
  showTooltip = false,
  className,
  value,
  defaultValue,
  ...props
}: SliderProps) {
  const [tooltipVisible, setTooltipVisible] = useState<number | null>(null);

  const resolvedValues = value ?? defaultValue ?? [0];

  return (
    <SliderPrimitive.Root
      className={clsx(styles.root, styles[`size-${size}`], styles[color], className)}
      value={value}
      defaultValue={defaultValue}
      {...props}
    >
      <SliderPrimitive.Track className={clsx(styles.track, styles[`track-${size}`])}>
        <SliderPrimitive.Range className={styles.range} />
      </SliderPrimitive.Track>
      {resolvedValues.map((thumbValue, index) => (
        <div key={index} className={styles.thumbWrapper}>
          {showTooltip && tooltipVisible === index && (
            <div className={styles.tooltip}>{thumbValue}</div>
          )}
          <SliderPrimitive.Thumb
            className={clsx(styles.thumb, styles[`thumb-${size}`])}
            aria-label={`Value ${index + 1}`}
            onMouseEnter={() => showTooltip && setTooltipVisible(index)}
            onMouseLeave={() => showTooltip && setTooltipVisible(null)}
            onFocus={() => showTooltip && setTooltipVisible(index)}
            onBlur={() => showTooltip && setTooltipVisible(null)}
          />
        </div>
      ))}
    </SliderPrimitive.Root>
  );
}
