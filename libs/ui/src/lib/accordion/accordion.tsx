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
              <div className="rounded-lg border border-slate-200 bg-white p-8">
                <Disclosure.Button className="flex w-full items-start text-left">
                  <span className="w-full text-2xl font-semibold">
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
                  enter="transition ease-in-out duration-300 transform"
                  enterFrom="-translate-y-2/4 opacity-0"
                  enterTo="translate-y-0 opacity-100"
                  leave="transition ease-in-out duration-300 transform"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <Disclosure.Panel className="mt-4 text-lg text-slate-600">
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
