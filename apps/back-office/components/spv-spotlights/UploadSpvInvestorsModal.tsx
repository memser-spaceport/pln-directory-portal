import React, { useState } from 'react';
import clsx from 'clsx';
import { useDropzone } from 'react-dropzone';
import Modal from '../modal/modal';
import UploadParticipantsResultModal from '../demo-days/UploadParticipantsResultModal';
import { BulkParticipantsResponse } from '../../screens/demo-days/types/demo-day';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import {
  INVESTOR_CSV_CHUNK_SIZE,
  INVESTOR_CSV_MAX_PARTICIPANTS,
  ParsedInvestorParticipant,
  parseInvestorCsv,
} from '../../utils/investor-csv';

const PREVIEW_ROWS = 100;

const TEMPLATE_COLUMNS: [header: string, example: string][] = [
  ['email', 'investor@example.com'],
  ['name', 'John Doe'],
  ['organization_name', 'Example Ventures'],
  ['organization_email', 'contact@exampleventures.com'],
  ['x_handle', 'johndoe'],
  ['linkedin_handle', 'johndoe'],
  ['telegram_handler', 'johndoe'],
  ['role', 'Partner'],
  ['investment_type', 'I invest through fund(s)'],
  ['typical_check_size', '50000'],
  ['investment_stages', '"Pre-seed,Seed"'],
  ['t&c', 'true'],
  ['team_lead', 'true'],
];

interface UploadSpvInvestorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  spotlightUid: string;
  authToken?: string | null;
  cohort: 'PRE_APPROVED' | 'OUTREACH';
  variableColumns: string[];
  onUploaded: () => void;
}

const downloadTemplate = (variableColumns: string[]) => {
  const extraColumns = variableColumns.filter((column) => !TEMPLATE_COLUMNS.some(([header]) => header === column));
  const headers = [...TEMPLATE_COLUMNS.map(([header]) => header), ...extraColumns];
  const exampleRow = [...TEMPLATE_COLUMNS.map(([, example]) => example), ...extraColumns.map(() => '')];
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
  const [rows, setRows] = useState<ParsedInvestorParticipant[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasUploadedRows, setHasUploadedRows] = useState(false);
  const [result, setResult] = useState<BulkParticipantsResponse | null>(null);

  const hasRowErrors = rows.some((row) => row.errors?.length);

  const resetFile = () => {
    setRows([]);
    setParseErrors([]);
    setError('');
  };

  const handleClose = () => {
    if (isUploading) return;
    if (hasUploadedRows) onUploaded();
    resetFile();
    setProgress(0);
    setHasUploadedRows(false);
    setResult(null);
    onClose();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    onDrop: async (accepted) => {
      const file = accepted[0];
      if (!file) return;
      try {
        const parsed = parseInvestorCsv(await file.text());
        if (parsed.participants.length > INVESTOR_CSV_MAX_PARTICIPANTS) {
          setError(
            `Maximum ${INVESTOR_CSV_MAX_PARTICIPANTS} investors allowed. Your file contains ${parsed.participants.length}.`
          );
          setRows([]);
          setParseErrors([]);
          return;
        }
        setRows(parsed.participants);
        setParseErrors(parsed.errors);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
        setRows([]);
        setParseErrors([]);
      }
    },
  });

  const handleSubmit = async () => {
    if (!authToken || !rows.length || hasRowErrors) return;
    setIsUploading(true);
    setError('');
    setProgress(0);
    const results: BulkParticipantsResponse[] = [];
    try {
      for (let i = 0; i < rows.length; i += INVESTOR_CSV_CHUNK_SIZE) {
        const participants = rows
          .slice(i, i + INVESTOR_CSV_CHUNK_SIZE)
          .map(({ willBeTeamLead, errors, extraColumns, ...participant }) => ({
            ...participant,
            ...(extraColumns ? { emailTemplateVariables: extraColumns } : {}),
          }));
        const { data } = await api.post<BulkParticipantsResponse>(
          `${API_ROUTE.ADMIN_SPV_SPOTLIGHTS}/${spotlightUid}/participants-bulk`,
          { cohort, participants },
          { headers: { authorization: `Bearer ${authToken}` } }
        );
        results.push(data);
        setHasUploadedRows(true);
        setProgress(Math.min(i + INVESTOR_CSV_CHUNK_SIZE, rows.length));
      }
      const sum = (key: keyof BulkParticipantsResponse['summary']) =>
        results.reduce((total, item) => total + (item.summary?.[key] ?? 0), 0);
      setResult({
        summary: {
          total: sum('total'),
          createdUsers: sum('createdUsers'),
          updatedUsers: sum('updatedUsers'),
          createdTeams: sum('createdTeams'),
          updatedMemberships: sum('updatedMemberships'),
          promotedToLead: sum('promotedToLead'),
          errors: sum('errors'),
        },
        rows: results.flatMap((item) => item.rows ?? []),
      });
      resetFile();
    } catch {
      setError(
        results.length
          ? `Upload stopped after ${Math.min(results.length * INVESTOR_CSV_CHUNK_SIZE, rows.length)} of ${
              rows.length
            } investors. Those investors were saved.`
          : 'Failed to upload investors. Please try again.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const percent = rows.length ? Math.round((progress / rows.length) * 100) : 0;
  const disabled = isUploading || !rows.length || hasRowErrors;

  return (
    <>
      <Modal isOpen={isOpen && !result} onClose={handleClose}>
        <div className="max-w-10xl w-full rounded-lg bg-white shadow-xl">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Upload Investors CSV</h3>
            <p className="mt-1 text-sm text-gray-500">Bulk upload investors from a CSV file</p>
          </div>

          <div className="space-y-6 px-6 py-6">
            {!rows.length && (
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
                  CSV files only • Required: email, name • Optional: organization, organization email, social handles,
                  role, investment type, check size, investment stages, SEC rules, team lead • Other columns become
                  email template variables • Max {INVESTOR_CSV_MAX_PARTICIPANTS} investors
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

            {(error || parseErrors.length > 0) && (
              <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error && <p>{error}</p>}
                {parseErrors.map((parseError) => (
                  <p key={parseError}>{parseError}</p>
                ))}
              </div>
            )}

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

            {rows.length > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">Investors Preview</h4>
                    <p className="text-sm text-gray-500">
                      {rows.length} investor{rows.length !== 1 ? 's' : ''} found
                      {rows.length > PREVIEW_ROWS && ` • Showing the first ${PREVIEW_ROWS}`}
                      {hasRowErrors && (
                        <span className="ml-2 text-red-500">• Fix the rows with errors and upload the file again</span>
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
                      onClick={resetFile}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Upload Different File
                    </button>
                  </div>
                </div>
                <div className="max-h-96 overflow-auto rounded-lg border border-gray-200" style={{ maxWidth: '90vw' }}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr>
                        {[
                          '#',
                          'Email',
                          'Name',
                          'Organization',
                          'Role',
                          'Invest Type',
                          'Check Size',
                          'Stages',
                          'Team Lead',
                          'Template variables',
                          'Status',
                        ].map((header) => (
                          <th
                            key={header}
                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                        <tr key={index} className={row.errors?.length ? 'bg-red-50' : undefined}>
                          <td className="px-4 py-2 text-sm text-gray-500">{index + 1}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.email}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.name || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.organization || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.role || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.investmentType || '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{row.typicalCheckSize ?? '—'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {row.investInStartupStages?.join(', ') || '—'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {row.organization ? (row.makeTeamLead ? 'Yes' : 'No') : '—'}
                          </td>
                          <td className="max-w-xs truncate px-4 py-2 text-sm text-gray-500">
                            {row.extraColumns ? JSON.stringify(row.extraColumns) : '—'}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {row.errors?.length ? (
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
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled}
              className={clsx(
                'rounded-lg px-4 py-2 text-sm font-medium text-white',
                disabled ? 'cursor-not-allowed bg-gray-400' : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {isUploading
                ? `Uploading ${progress}/${rows.length}...`
                : `Upload ${rows.length} Investor${rows.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </Modal>

      {result && (
        <UploadParticipantsResultModal isOpen onClose={handleClose} result={result} participantType="INVESTOR" />
      )}
    </>
  );
};
