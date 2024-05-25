import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { ReactNode, useRef, useState } from 'react';
import styles from './tooltip.module.css';
import useClickOutside from 'apps/web-app/hooks/shared/use-click-outside';

interface ITooptip {
  trigger: ReactNode;
  triggerClassName?: string;
  content: ReactNode;
  asChild?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
}

export function Tooltip({
  trigger,
  triggerClassName = '',
  content,
  asChild = false,
  side = 'bottom',
  sideOffset = 8,
  align = 'start',
}: ITooptip) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef(null);

  const onClickandHoverHandler = (e: any) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  useClickOutside(tooltipRef, () => setIsOpen(false));

  return (
    <>
      <div className="tooltip__trigger__mob">
        <TooltipPrimitive.Provider
          delayDuration={0}
          disableHoverableContent={false}
        >
          <TooltipPrimitive.Root open={isOpen}>
            <TooltipPrimitive.Trigger
              ref={tooltipRef}
              onClick={onClickandHoverHandler}
              className={triggerClassName}
              asChild={asChild}
            >
              {trigger}
            </TooltipPrimitive.Trigger>
            {content && (
              <TooltipPrimitive.Content
                side={side}
                align={align}
                sideOffset={sideOffset}
                className="tp"
                avoidCollisions
              >
                {content}
              </TooltipPrimitive.Content>
            )}
          </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>
      </div>

      <div className="tooltip__trigger__web">
        <TooltipPrimitive.Provider
          delayDuration={0}
          disableHoverableContent={false}
        >
          <TooltipPrimitive.Root>
            <TooltipPrimitive.Trigger
              className={triggerClassName}
              asChild={asChild}
            >
              {trigger}
            </TooltipPrimitive.Trigger>
            {content && (
              <TooltipPrimitive.Content
                side={side}
                align={align}
                sideOffset={sideOffset}
                className="tp"
                avoidCollisions
              >
                {content}
              </TooltipPrimitive.Content>
            )}
          </TooltipPrimitive.Root>
        </TooltipPrimitive.Provider>
      </div>
      <style jsx>
        {`
          .tp {
            z-index: 10;
            max-width: 260px;
            flex-shrink: 0;
            overflow-wrap: break-word;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 500;
            color: white;
            cursor: default;
            background-color:#000000
            padding: 4px 8px;
          }

          .tooltip__trigger__web {
            display: none;
          }

          @media (min-width: 1024px) {
            .tooltip__trigger__mob {
              display: none;
            }

            .tooltip__trigger__web {
              display: unset;
            }
          }
        `}
      </style>
    </>
  );
}
