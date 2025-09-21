import React from 'react';
import Modal from '../modal/modal';
import { BulkParticipantsResponse } from '../../screens/demo-days/types/demo-day';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  result: BulkParticipantsResponse;
  participantType: 'INVESTOR' | 'FOUNDER';
}

export default function UploadParticipantsResultModal({ isOpen, onClose, result, participantType }: Props) {
  const { summary, rows } = result;
  const hasErrors = summary.errors > 0;
  const failedRows = rows.filter((row) => row.status === 'error');
  const successRows = rows.filter((row) => row.status === 'success');

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-6xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h3 className="text-lg font-semibold text-gray-900">Upload Results</h3>
              <div
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  hasErrors ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                }`}
              >
                {hasErrors ? 'Completed with errors' : 'Upload successful'}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[80vh] overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Summary Section */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4 className="mb-4 text-base font-medium text-gray-900">Summary</h4>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-500">Total Processed</span>
                  <span className="text-xl font-semibold text-gray-900">{summary.total}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-500">Users Created</span>
                  <span className="text-xl font-semibold text-blue-600">{summary.createdUsers}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-500">Users Updated</span>
                  <span className="text-xl font-semibold text-blue-600">{summary.updatedUsers}</span>
                </div>
                {participantType === 'FOUNDER' && (
                  <>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-500">Teams Created</span>
                      <span className="text-xl font-semibold text-green-600">{summary.createdTeams}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-500">Memberships Updated</span>
                      <span className="text-xl font-semibold text-green-600">{summary.updatedMemberships}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-500">Promoted to Lead</span>
                      <span className="text-xl font-semibold text-purple-600">{summary.promotedToLead}</span>
                    </div>
                  </>
                )}
                {hasErrors && (
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-500">Errors</span>
                    <span className="text-xl font-semibold text-red-600">{summary.errors}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Success Section */}
            {successRows.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-base font-medium text-gray-900">Successfully Processed ({successRows.length})</h4>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Email
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Name
                          </th>
                          {participantType === 'FOUNDER' && (
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Organization
                            </th>
                          )}
                          {participantType === 'FOUNDER' && (
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Team Role
                            </th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {successRows.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{row.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm text-gray-900">{row.organization || '-'}</td>
                            )}
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm">
                                {row.membershipRole === 'LEAD' ? (
                                  <span className="inline-flex rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                                    Team Lead
                                  </span>
                                ) : row.membershipRole === 'MEMBER' ? (
                                  <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                                    Member
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">
                              <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                Success
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Failed Section */}
            {failedRows.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-base font-medium text-gray-900">Failed to Process ({failedRows.length})</h4>
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Email
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Name
                          </th>
                          {participantType === 'FOUNDER' && (
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Organization
                            </th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Error Message
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {failedRows.map((row, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{row.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm text-gray-900">{row.organization || '-'}</td>
                            )}
                            <td className="px-4 py-3 text-sm">
                              <span className="text-red-600">{row.message || 'Unknown error'}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
