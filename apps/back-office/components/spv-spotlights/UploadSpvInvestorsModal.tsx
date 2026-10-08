import React, { useState } from 'react';
import clsx from 'clsx';
import { useDropzone } from 'react-dropzone';
import Modal from '../modal/modal';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

const CHUNK_SIZE = 50;
const MAX_ROWS = 500;
const PREVIEW_ROWS = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Cohort = 'PRE_APPROVED' | 'OUTREACH';

type ParsedRow = {
  email: string;
  name?: string;
  emailTemplateVariables: Record<string, string>;
  errors: string[];
};

type UploadResult = { created: number; updated: number; skipped: number };

interface UploadSpvInvestorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  spotlightUid: string;
  authToken?: string | null;
  cohort: Cohort;
  variableColumns: string[];
  onUploaded: () => void;
}

const splitCsvLine = (line: string) => {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
};

const parseCsv = (text: string): ParsedRow[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const emailIndex = Math.max(
    headers.findIndex((header) => header.toLowerCase() === 'email'),
    0
  );
  const nameIndex = headers.findIndex((header) => header.toLowerCase() === 'name');
  const seen = new Set<string>();
  return lines
    .slice(1)
    .map((line) => {
      const cells = splitCsvLine(line);
      const emailTemplateVariables: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (index === emailIndex || index === nameIndex || !header) return;
        if (cells[index]) emailTemplateVariables[header] = cells[index];
      });
      const email = cells[emailIndex] ?? '';
      const errors: string[] = [];
      if (!EMAIL_PATTERN.test(email)) errors.push('Invalid email');
      else if (seen.has(email.toLowerCase())) errors.push('Duplicate email');
      seen.add(email.toLowerCase());
      return { email, name: nameIndex >= 0 ? cells[nameIndex] : undefined, emailTemplateVariables, errors };
    })
    .filter((row) => row.email);
};

const downloadTemplate = (variableColumns: string[]) => {
  const headers = ['email', 'name', ...variableColumns];
  const exampleRow = ['investor@example.com', 'John Doe', ...variableColumns.map(() => '')];
  const blob = new Blob([[headers.join(','), exampleRow.join(',')].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'spv_investors_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const UploadSpvInvestorsModal: React.FC<UploadSpvInvestorsModalProps> = ({
  isOpen,
  onClose,
  spotlightUid,
  authToken,
  cohort,
  variableColumns,
  onUploaded,
}) => {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);

  const hasErrors = rows.some((row) => row.errors.length > 0);

  const reset = () => {
    setRows([]);
    setError('');
    setProgress(0);
    setResult(null);
  };

  const handleClose = () => {
    if (isUploading) return;
    if (result) onUploaded();
    reset();
    onClose();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    onDrop: async (accepted) => {
      const file = accepted[0];
      if (!file) return;
      const parsed = parseCsv(await file.text());
      if (!parsed.length) {
        setError('No rows with an email column were found.');
        setRows([]);
      } else if (parsed.length > MAX_ROWS) {
        setError(`Maximum ${MAX_ROWS} investors allowed. Your file contains ${parsed.length}.`);
        setRows([]);
      } else {
        setError('');
        setRows(parsed);
      }
    },
  });

  const handleSubmit = async () => {
    if (!authToken || !rows.length || hasErrors) return;
    setIsUploading(true);
    setError('');
    setProgress(0);
    const totals: UploadResult = { created: 0, updated: 0, skipped: 0 };
    try {
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const participants = rows
          .slice(i, i + CHUNK_SIZE)
          .map(({ email, name, emailTemplateVariables }) => ({ email, name, emailTemplateVariables }));
        const { data } = await api.post(
          `${API_ROUTE.ADMIN_SPV_SPOTLIGHTS}/${spotlightUid}/participants-bulk`,
          { cohort, participants },
          { headers: { authorization: `Bearer ${authToken}` } }
        );
        totals.created += data.created ?? 0;
        totals.updated += data.updated ?? 0;
        totals.skipped += data.skipped ?? 0;
        setProgress(Math.min(i + CHUNK_SIZE, rows.length));
      }
      setResult(totals);
      setRows([]);
    } catch {
      const processed = totals.created + totals.updated + totals.skipped;
      setError(
        processed > 0
          ? `Upload stopped after ${processed} of ${rows.length} investors. Those investors were saved.`
          : 'Failed to upload investors. Please try again.'
      );
      if (processed > 0) onUploaded();
    } finally {
      setIsUploading(false);
    }
  };

  const percent = rows.length ? Math.round((progress / rows.length) * 100) : 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="max-w-10xl w-full rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Upload Investors CSV</h3>
          <p className="mt-1 text-sm text-gray-500">Bulk upload investors from a CSV file</p>
        </div>

        <div className="space-y-6 px-6 py-6">
          {result && (
            <div>
              <p className="mb-3 text-sm font-medium text-green-700">Upload complete</p>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ['Added', result.created],
                    ['Updated', result.updated],
                    ['Skipped (already added)', result.skipped],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                    <p className="text-2xl font-semibold text-gray-900">{value}</p>
                    <p className="mt-1 text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!result && !rows.length && (
            <div
              {...getRootProps()}
              className={clsx(
                'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200',
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              )}
            >
              <input {...getInputProps()} />
              <p className="text-lg font-medium text-gray-900">
                {isDragActive ? 'Drop the CSV file here' : 'Upload CSV file'}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Drag and drop your file here, or <span className="font-medium text-blue-600">click to browse</span>
              </p>
              <p className="mt-4 text-xs text-gray-400">
                CSV files only • Required: email • Optional: name
                {variableColumns.length > 0 && `, ${variableColumns.join(', ')}`} • Extra columns become email template
                variables • Max {MAX_ROWS} investors
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadTemplate(variableColumns);
                }}
                className="mt-4 inline-flex items-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                Download CSV Template
              </button>
            </div>
          )}

          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {isUploading && (
            <div className="rounded-lg bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-900">Uploading investors...</p>
                  <p className="text-sm text-blue-700">
                    {progress} of {rows.length} investors uploaded
                  </p>
                </div>
                <p className="text-lg font-semibold text-blue-900">{percent}%</p>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-blue-200">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-300 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {!result && rows.length > 0 && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-medium text-gray-900">Investors Preview</h4>
                  <p className="text-sm text-gray-500">
                    {rows.length} investor{rows.length !== 1 ? 's' : ''} found
                    {rows.length > PREVIEW_ROWS && ` • Showing the first ${PREVIEW_ROWS}`}
                    {hasErrors && (
                      <span className="ml-2 text-red-500">• Fix the rows with errors and upload again</span>
                    )}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => downloadTemplate(variableColumns)}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Download Template
                  </button>
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={reset}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Upload Different File
                  </button>
                </div>
              </div>
              <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      {['#', 'Email', 'Name', 'Template variables', 'Status'].map((header) => (
                        <th
                          key={header}
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                      <tr key={index} className={row.errors.length ? 'bg-red-50' : undefined}>
                        <td className="px-4 py-2 text-sm text-gray-500">{index + 1}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{row.email}</td>
                        <td className="px-4 py-2 text-sm text-gray-900">{row.name || '—'}</td>
                        <td className="max-w-xs truncate px-4 py-2 text-sm text-gray-500">
                          {Object.keys(row.emailTemplateVariables).length
                            ? JSON.stringify(row.emailTemplateVariables)
                            : '—'}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {row.errors.length ? (
                            <span className="text-red-600">{row.errors.join(', ')}</span>
                          ) : (
                            <span className="text-green-600">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isUploading || !rows.length || hasErrors}
              className={clsx(
                'rounded-lg px-4 py-2 text-sm font-medium text-white',
                isUploading || !rows.length || hasErrors
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {isUploading
                ? `Uploading ${progress}/${rows.length}...`
                : `Upload ${rows.length} Investor${rows.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
