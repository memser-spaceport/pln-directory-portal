import React, { useState } from 'react';
import Modal from '../modal/modal';
import { BulkParticipantsResponse } from '../../screens/demo-days/types/demo-day';
import { mapDemoDayParticipantError } from '../../utils/error-messages';

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

  // Pagination state for success rows
  const [successCurrentPage, setSuccessCurrentPage] = useState(1);
  const successItemsPerPage = 50;
  const successTotalPages = Math.ceil(successRows.length / successItemsPerPage);
  const successStartIndex = (successCurrentPage - 1) * successItemsPerPage;
  const successEndIndex = successStartIndex + successItemsPerPage;
  const currentSuccessRows = successRows.slice(successStartIndex, successEndIndex);

  // Pagination state for failed rows
  const [failedCurrentPage, setFailedCurrentPage] = useState(1);
  const failedItemsPerPage = 50;
  const failedTotalPages = Math.ceil(failedRows.length / failedItemsPerPage);
  const failedStartIndex = (failedCurrentPage - 1) * failedItemsPerPage;
  const failedEndIndex = failedStartIndex + failedItemsPerPage;
  const currentFailedRows = failedRows.slice(failedStartIndex, failedEndIndex);

  // Reset pagination when result changes
  React.useEffect(() => {
    setSuccessCurrentPage(1);
    setFailedCurrentPage(1);
  }, [result]);

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
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-medium text-gray-900">Successfully Processed ({successRows.length})</h4>
                  {successTotalPages > 1 && (
                    <span className="text-sm text-gray-500">
                      Showing {successStartIndex + 1}-{Math.min(successEndIndex, successRows.length)} of{' '}
                      {successRows.length}
                    </span>
                  )}
                </div>
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
                              Org Email
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
                        {currentSuccessRows.map((row, index) => (
                          <tr key={successStartIndex + index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{row.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm text-gray-900">{row.organization || '-'}</td>
                            )}
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm text-gray-900">{row.organizationEmail || '-'}</td>
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

                {/* Success Pagination Controls */}
                {successTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => setSuccessCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={successCurrentPage === 1}
                        className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setSuccessCurrentPage((prev) => Math.min(prev + 1, successTotalPages))}
                        disabled={successCurrentPage === successTotalPages}
                        className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Page <span className="font-medium">{successCurrentPage}</span> of{' '}
                          <span className="font-medium">{successTotalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav
                          className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                          aria-label="Success Pagination"
                        >
                          <button
                            onClick={() => setSuccessCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={successCurrentPage === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="sr-only">Previous</span>
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path
                                fillRule="evenodd"
                                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>

                          {/* Success Page numbers */}
                          {Array.from({ length: Math.min(5, successTotalPages) }, (_, i) => {
                            const pageNumber = Math.max(1, Math.min(successTotalPages - 4, successCurrentPage - 2)) + i;
                            return (
                              <button
                                key={pageNumber}
                                onClick={() => setSuccessCurrentPage(pageNumber)}
                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                  pageNumber === successCurrentPage
                                    ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                }`}
                              >
                                {pageNumber}
                              </button>
                            );
                          })}

                          <button
                            onClick={() => setSuccessCurrentPage((prev) => Math.min(prev + 1, successTotalPages))}
                            disabled={successCurrentPage === successTotalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="sr-only">Next</span>
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Failed Section */}
            {failedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-medium text-gray-900">Failed to Process ({failedRows.length})</h4>
                  {failedTotalPages > 1 && (
                    <span className="text-sm text-gray-500">
                      Showing {failedStartIndex + 1}-{Math.min(failedEndIndex, failedRows.length)} of{' '}
                      {failedRows.length}
                    </span>
                  )}
                </div>
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
                              Org Email
                            </th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Error Message
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {currentFailedRows.map((row, index) => (
                          <tr key={failedStartIndex + index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{row.email}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm text-gray-900">{row.organization || '-'}</td>
                            )}
                            {participantType === 'FOUNDER' && (
                              <td className="px-4 py-3 text-sm text-gray-900">{row.organizationEmail || '-'}</td>
                            )}
                            <td className="px-4 py-3 text-sm">
                              <span className="text-red-600">{mapDemoDayParticipantError(row.message || '')}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Failed Pagination Controls */}
                {failedTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => setFailedCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={failedCurrentPage === 1}
                        className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setFailedCurrentPage((prev) => Math.min(prev + 1, failedTotalPages))}
                        disabled={failedCurrentPage === failedTotalPages}
                        className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Page <span className="font-medium">{failedCurrentPage}</span> of{' '}
                          <span className="font-medium">{failedTotalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav
                          className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                          aria-label="Failed Pagination"
                        >
                          <button
                            onClick={() => setFailedCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={failedCurrentPage === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="sr-only">Previous</span>
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path
                                fillRule="evenodd"
                                d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>

                          {/* Failed Page numbers */}
                          {Array.from({ length: Math.min(5, failedTotalPages) }, (_, i) => {
                            const pageNumber = Math.max(1, Math.min(failedTotalPages - 4, failedCurrentPage - 2)) + i;
                            return (
                              <button
                                key={pageNumber}
                                onClick={() => setFailedCurrentPage(pageNumber)}
                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                  pageNumber === failedCurrentPage
                                    ? 'z-10 bg-red-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600'
                                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                }`}
                              >
                                {pageNumber}
                              </button>
                            );
                          })}

                          <button
                            onClick={() => setFailedCurrentPage((prev) => Math.min(prev + 1, failedTotalPages))}
                            disabled={failedCurrentPage === failedTotalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="sr-only">Next</span>
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
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
