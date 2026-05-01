import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@headlessui/react';
import clsx from 'clsx';

import s from './PolicyMultiSelect.module.scss';
import { ChevronDownIcon, CloseSmallIcon, SearchIcon } from './icons';
import { iconForRole } from './roleIconMap';

export interface PolicyOption {
  label: string;
  value: string;
  role: string;
  group: string;
}

export interface PolicySelection {
  label: string;
  value: string;
}

interface Props {
  options: PolicyOption[];
  value: PolicySelection[];
  onChange: (next: PolicySelection[]) => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
  ariaLabelledBy?: string;
}

const UNASSIGNED_ROLE = 'Unassigned';

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function matchesSearch(option: PolicyOption, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = normalize(`${option.label} ${option.role} ${option.group}`);
  return tokens.every((t) => haystack.includes(t));
}

function groupByRole(options: PolicyOption[]): Array<{ role: string; items: PolicyOption[] }> {
  const map = new Map<string, PolicyOption[]>();
  for (const opt of options) {
    const list = map.get(opt.role);
    if (list) list.push(opt);
    else map.set(opt.role, [opt]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED_ROLE && b !== UNASSIGNED_ROLE) return 1;
      if (b === UNASSIGNED_ROLE && a !== UNASSIGNED_ROLE) return -1;
      return a.localeCompare(b);
    })
    .map(([role, items]) => ({
      role,
      items: items.slice().sort((x, y) => x.label.localeCompare(y.label)),
    }));
}

export function PolicyMultiSelect({
  options,
  value,
  onChange,
  isLoading = false,
  isDisabled = false,
  placeholder = 'Select policies',
  ariaLabelledBy,
}: Props) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const disabled = isDisabled || isLoading;

  const handleRemoveChip = (code: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange(value.filter((v) => v.value !== code));
  };

  return (
    <Popover className={s.root}>
      {({ open, close }) => (
        <>
          <Popover.Button
            ref={triggerRef}
            as="div"
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            aria-labelledby={ariaLabelledBy}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={clsx(s.trigger, { [s.disabled]: disabled, [s.open]: open })}
          >
            <div className={s.triggerContent}>
              {isLoading ? (
                <span className={s.spinner} aria-label="Loading policies" />
              ) : value.length === 0 ? (
                <span className={s.placeholder}>{placeholder}</span>
              ) : (
                value.map((v) => (
                  <span key={v.value} className={s.chip} title={v.label}>
                    <span className={s.chipLabel}>{v.label}</span>
                    <button
                      type="button"
                      className={s.chipRemove}
                      aria-label={`Remove ${v.label}`}
                      disabled={open || disabled}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={handleRemoveChip(v.value)}
                    >
                      <CloseSmallIcon />
                    </button>
                  </span>
                ))
              )}
            </div>
            <ChevronDownIcon className={clsx(s.chevron, { [s.chevronOpen]: open })} />
          </Popover.Button>

          <Popover.Panel className={s.panel} style={{ zIndex: 9999 }} static={false}>
            <PanelBody
              open={open}
              close={close}
              options={options}
              value={value}
              onChange={onChange}
              triggerRef={triggerRef}
            />
          </Popover.Panel>
        </>
      )}
    </Popover>
  );
}

interface PanelBodyProps {
  open: boolean;
  close: () => void;
  options: PolicyOption[];
  value: PolicySelection[];
  onChange: (next: PolicySelection[]) => void;
  triggerRef: React.RefObject<HTMLDivElement>;
}

function PanelBody({ open, close, options, value, onChange, triggerRef }: PanelBodyProps) {
  const [pending, setPending] = useState<Map<string, PolicySelection>>(
    () => new Map(value.map((v) => [v.value, v]))
  );
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Re-seed pending + search each time the panel opens
  useEffect(() => {
    if (open) {
      setPending(new Map(value.map((v) => [v.value, v])));
      setSearch('');
      // Focus the search input on open
      const id = window.setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // Intentionally omit `value` — we only re-seed on open transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filteredGrouped = useMemo(() => {
    const tokens = normalize(search).split(/\s+/).filter(Boolean);
    return groupByRole(options.filter((o) => matchesSearch(o, tokens)));
  }, [options, search]);

  const focusTrigger = () => {
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      focusTrigger();
    }
  };

  const togglePending = (option: PolicyOption) => {
    setPending((prev) => {
      const next = new Map(prev);
      if (next.has(option.value)) next.delete(option.value);
      else next.set(option.value, { label: option.label, value: option.value });
      return next;
    });
  };

  const handleCancel = () => {
    close();
    focusTrigger();
  };

  const handleCommit = () => {
    onChange([...pending.values()]);
    close();
    focusTrigger();
  };

  return (
    <div className={s.panelInner} onKeyDown={handleKeyDown}>
      <div className={s.searchRow}>
        <SearchIcon className={s.searchIcon} />
        <input
          ref={searchInputRef}
          type="search"
          className={s.searchInput}
          placeholder="Search by name, role or group"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search policies"
        />
      </div>

      <div className={s.list} role="listbox" aria-multiselectable="true">
        {filteredGrouped.length === 0 ? (
          <div className={s.emptyState} aria-live="polite">
            No matching policies
          </div>
        ) : (
          filteredGrouped.map(({ role, items }) => (
            <div key={role} className={s.group}>
              <div className={s.groupHeader}>{role}</div>
              {items.map((item) => {
                const Icon = iconForRole(item.role);
                const checked = pending.has(item.value);
                const rowId = `policy-row-${item.value}`;
                return (
                  <label key={item.value} className={s.row} htmlFor={rowId}>
                    <input
                      id={rowId}
                      type="checkbox"
                      className={s.checkbox}
                      checked={checked}
                      onChange={() => togglePending(item)}
                    />
                    <Icon className={s.rowIcon} />
                    <span className={s.rowLabel}>{item.label}</span>
                  </label>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className={s.footer}>
        <button type="button" className={s.secondaryBtn} onClick={handleCancel}>
          Cancel
        </button>
        <button type="button" className={s.primaryBtn} onClick={handleCommit}>
          Select
        </button>
      </div>
    </div>
  );
}
