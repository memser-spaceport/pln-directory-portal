import React, { useEffect, useState } from 'react';
import Modal from '../modal/modal';
import { useCookie } from 'react-use';
import { InvestorProfileInput, useUpsertInvestorProfile } from '../../hooks/demo-days/useUpsertInvestorProfile';

const STAGES = ['Pre-seed', 'Seed', 'Series A', 'Series B+'];
const FUND_TYPES = ['Angel', 'Syndicate', 'Venture', 'Family Office', 'Corporate'];

export const EditInvestorProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  memberUid: string;
  initial?: InvestorProfileInput;
}> = ({ isOpen, onClose, memberUid, initial }) => {
  const [authToken] = useCookie('plnadmin');
  const upsert = useUpsertInvestorProfile();

  // keep raw text so commas can be typed freely
  const [focusRaw, setFocusRaw] = useState<string>('');
  const [stages, setStages] = useState<string[]>(initial?.investInStartupStages || []);
  const [fundTypes, setFundTypes] = useState<string[]>(initial?.investInFundTypes || []);
  const [checkSize, setCheckSize] = useState<string>(initial?.typicalCheckSize?.toString() || '');
  const [sec, setSec] = useState<boolean>(initial?.secRulesAccepted || false);

  // hydrate when initial changes
  useEffect(() => {
    setFocusRaw((initial?.investmentFocus || []).join(', '));
    setStages(initial?.investInStartupStages || []);
    setFundTypes(initial?.investInFundTypes || []);
    setCheckSize(initial?.typicalCheckSize != null ? String(initial.typicalCheckSize) : '');
    setSec(!!initial?.secRulesAccepted);
  }, [initial, isOpen]);

  const toggleFromArray = (arr: string[], setter: (v: string[]) => void, value: string) => {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const parsedFocus = (): string[] =>
    focusRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean); // parse only when needed

  const onSave = async () => {
    if (!authToken) return;
    const payload: InvestorProfileInput = {
      investmentFocus: parsedFocus(),
      investInStartupStages: stages,
      investInFundTypes: fundTypes,
      typicalCheckSize: checkSize ? Number(checkSize) : undefined,
      secRulesAccepted: sec,
    };
    await upsert.mutateAsync({ authToken, memberUid, data: payload });
    onClose();
  };

  const focusIsValid = parsedFocus().length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="min-w-[520px] max-w-[720px] p-5">
        <h3 className="mb-4 text-lg font-semibold">Edit investor profile</h3>

        {/* Investment focus */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">
            Investment focus <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            value={focusRaw}
            onChange={(e) => setFocusRaw(e.target.value)}
            placeholder="Comma-separated (e.g. AI, Infra, Fintech)"
          />
          <p className="mt-1 text-xs text-gray-500">Example: <em>AI, Infra, Fintech</em></p>
        </div>

        {/* Startup stages */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Startup stages</label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {STAGES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={stages.includes(s)}
                  onChange={() => toggleFromArray(stages, setStages, s)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        {/* Fund types */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Fund types</label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {FUND_TYPES.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fundTypes.includes(f)}
                  onChange={() => toggleFromArray(fundTypes, setFundTypes, f)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        {/* Typical check size */}
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Typical check size (USD)</label>
          <input
            type="number"
            min="0"
            step="1000"
            inputMode="numeric"
            value={checkSize}
            onChange={(e) => setCheckSize(e.target.value)}
            placeholder="e.g. 250000"
            className="w-full rounded-lg border px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* SEC rules */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sec}
              onChange={(e) => setSec(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            I confirm the SEC/eligibility rules
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-4 py-2">Cancel</button>
          <button
            onClick={onSave}
            disabled={upsert.isPending || !focusIsValid}
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {upsert.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
