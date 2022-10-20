import { Disclosure, Transition } from '@headlessui/react';
import { ArrowIcon } from '../icons/arrow/arrow';

interface AccordionProps {
  items: { triggerText: string; content: string }[];
}

export function Accordion({ items }: AccordionProps) {
  return (
    <div className="flex flex-col gap-4">
      {items.map(({ triggerText, content }, i) => {
        return (
          <Disclosure key={i}>
            {({ open }) => (
              <div className="rounded-lg border border-slate-200 bg-white">
                <Disclosure.Button className="flex w-full items-start p-8 text-left">
                  <span className="w-full pr-8 text-2xl font-semibold">
                    {triggerText}
                  </span>
                  <span
                    className={`flex h-8 w-8 shrink-0 transform items-center justify-center justify-self-end rounded-full bg-slate-100 transition-all duration-150 ease-out 
                ${open ? 'rotate-180' : ''}
              }`}
                  >
                    <ArrowIcon />
                  </span>
                </Disclosure.Button>
                <Transition
                  show={open}
                  className="overflow-hidden"
                  enter="transition-[max-height] duration-300 ease-in-out"
                  enterFrom="transform max-h-0"
                  enterTo="transform max-h-screen"
                  leave="transition-[max-height] duration-300 ease-in-out"
                  leaveFrom="transform max-h-screen"
                  leaveTo="transform max-h-0"
                >
                  <Disclosure.Panel
                    className="p-8 pt-0 text-lg text-slate-600"
                    static
                  >
                    <div dangerouslySetInnerHTML={{ __html: content }} />
                  </Disclosure.Panel>
                </Transition>
              </div>
            )}
          </Disclosure>
        );
      })}
    </div>
  );
}
