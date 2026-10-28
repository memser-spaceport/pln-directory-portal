import React, { useState } from 'react';

import { trackEvent } from '../../../utils/services/analytics';
import { validateInvestorEmail, parseInvestorCsvLine, normalizeInvestorCsvHeader } from '../../../utils/investor-csv';

import { useAuth } from '../../../context/auth-context';

import { CsvUploadModal } from '../CsvUploadModal';

const CSV_SELECTION_EVENT = 'spotlight-email-csv-send';

interface SelectableInvestor {
  uid: string;
  member: { email: string | null };
}

interface SelectSpvInvestorsModalProps {
  isOpen: boolean;
  spotlightUid: string;
  investors: SelectableInvestor[];
  onSelect: (investorUids: string[]) => void;
  onClose: () => void;
}

interface CsvMatch {
  matchedUids: string[];
  notOnListEmails: string[];
  invalidCount: number;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const readCsvEmails = (csvContent: string) => {
  const lines = csvContent.split('\n').filter((line) => line.trim());
  if (!lines.length) throw new Error('CSV file is empty');

  const headers = parseInvestorCsvLine(lines[0]).map((header) => normalizeInvestorCsvHeader(header.replace(/"/g, '')));
  const emailIndex = headers.indexOf('email');
  if (emailIndex === -1) throw new Error('CSV must contain an "email" column');

  const emails = new Set<string>();
  let invalidCount = 0;
  for (const line of lines.slice(1)) {
    const email = normalizeEmail((parseInvestorCsvLine(line)[emailIndex] ?? '').replace(/"/g, ''));
    if (validateInvestorEmail(email)) emails.add(email);
    else invalidCount += 1;
  }
  return { emails: [...emails], invalidCount };
};

const matchInvestors = (csvContent: string, investors: SelectableInvestor[]): CsvMatch => {
  const { emails, invalidCount } = readCsvEmails(csvContent);
  const uidByEmail = new Map(
    investors
      .filter((investor) => investor.member.email)
      .map((investor) => [normalizeEmail(investor.member.email as string), investor.uid])
  );
  return {
    matchedUids: emails.flatMap((email) => uidByEmail.get(email) ?? []),
    notOnListEmails: emails.filter((email) => !uidByEmail.has(email)),
    invalidCount,
  };
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const SelectSpvInvestorsModal: React.FC<SelectSpvInvestorsModalProps> = (props) => {
  const { isOpen, spotlightUid, investors, onSelect, onClose } = props;

  const { user } = useAuth();

  const [match, setMatch] = useState<CsvMatch | null>(null);
  const [error, setError] = useState('');

  const resetFile = () => {
    setMatch(null);
    setError('');
  };

  const handleClose = () => {
    resetFile();
    onClose();
  };

  const handleFileDrop = async (file: File) => {
    try {
      setMatch(matchInvestors(await file.text(), investors));
      setError('');
    } catch (err) {
      setMatch(null);
      setError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
  };

  const handleSubmit = () => {
    if (!match?.matchedUids.length) return;
    onSelect(match.matchedUids);

    if (user) {
      trackEvent({
        name: CSV_SELECTION_EVENT,
        distinctId: user.uid,
        properties: {
          spotlightUid,
          matchedCount: match.matchedUids.length,
          notOnListCount: match.notOnListEmails.length,
          invalidCount: match.invalidCount,
        },
      }).catch((err) => console.error('[SelectSpvInvestorsModal] Failed to track CSV selection', err));
    }

    handleClose();
  };

  const matchedCount = match?.matchedUids.length ?? 0;

  return (
    <CsvUploadModal
      isOpen={isOpen}
      title="Select Investors via CSV"
      subtitle="Select the investors on this spotlight whose emails are in a CSV file"
      showDropzone={!match}
      dropzoneHint="CSV files only • Required: email column • Other columns are ignored • Emails that are not on this spotlight are skipped"
      errors={error ? [error] : []}
      isBusy={false}
      submitLabel={`Select ${plural(matchedCount, 'Investor')}`}
      isSubmitDisabled={!matchedCount}
      onFileDrop={handleFileDrop}
      onSubmit={handleSubmit}
      onClose={handleClose}
    >
      {match && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{plural(matchedCount, 'investor')} will be selected</p>
              {match.notOnListEmails.length > 0 && (
                <p className="text-gray-500">
                  {plural(match.notOnListEmails.length, 'email')} skipped: not on this spotlight
                </p>
              )}
              {match.invalidCount > 0 && (
                <p className="text-gray-500">{plural(match.invalidCount, 'row')} skipped: missing or invalid email</p>
              )}
              {!matchedCount && (
                <p className="text-red-600">
                  No investor from this file is on the spotlight. Nothing will be selected.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={resetFile}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Upload Different File
            </button>
          </div>

          {match.notOnListEmails.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Not on this spotlight</p>
              <ul className="space-y-1 text-sm text-gray-700">
                {match.notOnListEmails.map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </CsvUploadModal>
  );
};
