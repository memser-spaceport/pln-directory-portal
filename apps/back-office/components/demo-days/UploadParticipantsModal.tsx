import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQueryClient } from '@tanstack/react-query';
import Modal from '../modal/modal';
import { useCookie } from 'react-use';
import { useAddInvestorParticipantsBulk } from '../../hooks/demo-days/useAddInvestorParticipantsBulk';
import { useAddTeamPitchParticipantsBulk } from '../../hooks/team-pitches/useAddTeamPitchParticipantsBulk';
import { BulkParticipantsResponse } from '../../screens/demo-days/types/demo-day';
import UploadParticipantsResultModal from './UploadParticipantsResultModal';
import { DemoDaysQueryKeys } from '../../hooks/demo-days/constants/queryKeys';
import { TeamPitchesQueryKeys } from '../../hooks/team-pitches/constants/queryKeys';
import clsx from 'clsx';
import {
  INVESTOR_CSV_CHUNK_SIZE,
  INVESTOR_CSV_ITEMS_PER_PAGE,
  INVESTOR_CSV_MAX_PARTICIPANTS,
  ParsedInvestorParticipant,
  downloadInvestorCsvTemplate,
  parseInvestorCsv,
  revalidateParsedInvestorParticipant,
  toInvestorParticipantsForApi,
} from '../../utils/investor-csv';

interface UploadParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoDayUid?: string;
  pitchUid?: string;
}

export const UploadParticipantsModal: React.FC<UploadParticipantsModalProps> = ({
  isOpen,
  onClose,
  demoDayUid,
  pitchUid,
}) => {
  const queryClient = useQueryClient();
  const [authToken] = useCookie('plnadmin');
  const [parsedParticipants, setParsedParticipants] = useState<ParsedInvestorParticipant[]>([]);
  const [error, setError] = useState<string>('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [uploadResult, setUploadResult] = useState<BulkParticipantsResponse | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = INVESTOR_CSV_ITEMS_PER_PAGE;
  const maxParticipants = INVESTOR_CSV_MAX_PARTICIPANTS;

  // Upload progress state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  const addInvestorParticipantsBulkMutation = useAddInvestorParticipantsBulk();
  const addTeamPitchParticipantsBulkMutation = useAddTeamPitchParticipantsBulk();
  const isTeamPitch = Boolean(pitchUid);

  // Pagination calculations
  const totalPages = Math.ceil(parsedParticipants.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentParticipants = parsedParticipants.slice(startIndex, endIndex);

  // Reset pagination when participants change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [parsedParticipants]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csvContent = e.target?.result as string;
          const { participants, errors } = parseInvestorCsv(csvContent);

          // Check participant limit
          if (participants.length > maxParticipants) {
            setError(
              `Maximum ${maxParticipants} participants allowed. Your file contains ${participants.length} participants.`
            );
            setParsedParticipants([]);
            setParseErrors([]);
            return;
          }

          setParsedParticipants(participants);
          setParseErrors(errors);
          setError('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse CSV');
          setParsedParticipants([]);
          setParseErrors([]);
        }
      };
      reader.readAsText(file);
    },
    [maxParticipants]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const downloadCSVTemplate = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    downloadInvestorCsvTemplate();
  };

  const handleSubmit = async () => {
    if (!authToken || parsedParticipants.length === 0) return;
    if (!pitchUid && !demoDayUid) return;

    // Check participant limit
    if (parsedParticipants.length > maxParticipants) {
      setError(`Maximum ${maxParticipants} participants allowed. You have ${parsedParticipants.length} participants.`);
      return;
    }

    // Check for validation errors
    const hasErrors = parsedParticipants.some((p) => p.errors && p.errors.length > 0);
    if (hasErrors) {
      setError('Please fix all validation errors before submitting.');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: parsedParticipants.length });

    try {
      const participantsForAPI = toInvestorParticipantsForApi(parsedParticipants);

      const chunkSize = INVESTOR_CSV_CHUNK_SIZE;
      const chunks = [];
      for (let i = 0; i < participantsForAPI.length; i += chunkSize) {
        chunks.push(participantsForAPI.slice(i, i + chunkSize));
      }

      const allResults: BulkParticipantsResponse[] = [];

      // Process each chunk sequentially
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const currentProcessed = i * chunkSize;
        const nextProcessed = Math.min(currentProcessed + chunkSize, participantsForAPI.length);

        setUploadProgress({ current: nextProcessed, total: participantsForAPI.length });

        let result: BulkParticipantsResponse;
        if (isTeamPitch && pitchUid) {
          result = await addTeamPitchParticipantsBulkMutation.mutateAsync({
            authToken,
            pitchUid,
            data: { participants: chunk },
          });
        } else if (demoDayUid) {
          result = await addInvestorParticipantsBulkMutation.mutateAsync({
            authToken,
            demoDayUid,
            data: { participants: chunk },
          });
        } else {
          continue;
        }

        allResults.push(result);

        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Combine all results for the final modal
      const finalResult: BulkParticipantsResponse = {
        summary: {
          total: allResults.reduce((sum, result) => sum + (result.summary?.total || 0), 0),
          createdUsers: allResults.reduce((sum, result) => sum + (result.summary?.createdUsers || 0), 0),
          updatedUsers: allResults.reduce((sum, result) => sum + (result.summary?.updatedUsers || 0), 0),
          createdTeams: allResults.reduce((sum, result) => sum + (result.summary?.createdTeams || 0), 0),
          updatedMemberships: allResults.reduce((sum, result) => sum + (result.summary?.updatedMemberships || 0), 0),
          promotedToLead: allResults.reduce((sum, result) => sum + (result.summary?.promotedToLead || 0), 0),
          errors: allResults.reduce((sum, result) => sum + (result.summary?.errors || 0), 0),
        },
        rows: allResults.flatMap((result) => result.rows || []),
      };

      // Invalidate participants query only after all chunks are processed
      if (isTeamPitch) {
        queryClient.invalidateQueries({
          queryKey: [TeamPitchesQueryKeys.PARTICIPANTS, authToken, pitchUid],
        });
      } else {
        queryClient.invalidateQueries({
          queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_PARTICIPANTS, authToken, demoDayUid],
        });
      }

      // Show results modal
      setUploadResult(finalResult);
      setShowResultModal(true);

      // Reset form
      setParsedParticipants([]);
      setError('');
      setParseErrors([]);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error uploading participants:', error);
      setError('Failed to upload participants. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  const handleClose = () => {
    setParsedParticipants([]);
    setError('');
    setParseErrors([]);
    setUploadResult(null);
    setShowResultModal(false);
    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    setCurrentPage(1);
    onClose();
  };

  const handleResultModalClose = () => {
    setShowResultModal(false);
    setUploadResult(null);
    onClose();
  };

  const removeParticipant = (index: number) => {
    setParsedParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const updateParticipant = (
    index: number,
    field: keyof Omit<ParsedInvestorParticipant, 'errors' | 'willBeTeamLead'>,
    value: string | boolean | number | string[] | null
  ) => {
    setParsedParticipants((prev) =>
      prev.map((p, i) => (i === index ? revalidateParsedInvestorParticipant(p, field, value) : p))
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose}>
        <div className="max-w-10xl w-full rounded-lg bg-white shadow-xl">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Upload Investors CSV</h3>
                <p className="mt-1 text-sm text-gray-500">Bulk upload investors from a CSV file</p>
              </div>
              <button onClick={handleClose} className="text-gray-400 transition-colors hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            <div className="space-y-6">
              {/* File Upload */}
              {!parsedParticipants.length && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Upload CSV File <span className="text-red-500">*</span>
                  </label>
                  <div
                    {...getRootProps()}
                    className={clsx(
                      'cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all duration-200',
                      isDragActive
                        ? 'scale-105 border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="space-y-4">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                        <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-lg font-medium text-gray-900">
                          {isDragActive ? 'Drop the CSV file here' : 'Upload CSV file'}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Drag and drop your file here, or{' '}
                          <span className="font-medium text-blue-600">click to browse</span>
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          <span>
                            CSV files only • Required: email, name • Optional: organization, organization email, social
                            handles, role, investment type, check size, investment stages, SEC rules • Max{' '}
                            {maxParticipants} participants
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={downloadCSVTemplate}
                          className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                        >
                          <svg className="mr-1.5 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                          Download CSV Template
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Messages */}
              {(error || parseErrors.length > 0) && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="space-y-2">
                    {error && (
                      <div className="flex items-center">
                        <svg
                          className="mr-2 h-5 w-5 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="text-sm text-red-600">{error}</span>
                      </div>
                    )}
                    {parseErrors.map((parseError, index) => (
                      <div key={index} className="flex items-center">
                        <svg
                          className="mr-2 h-5 w-5 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="text-sm text-red-600">{parseError}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Progress Indicator */}
              {isUploading && (
                <div className="mb-6 rounded-lg bg-blue-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg className="mr-3 h-5 w-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-blue-900">Uploading participants...</p>
                        <p className="text-sm text-blue-700">
                          {uploadProgress.current} of {uploadProgress.total} participants uploaded
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-blue-900">
                        {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-blue-200">
                    <div
                      className="h-2 rounded-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Parsed Participants Preview Table */}
              {parsedParticipants.length > 0 && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-medium text-gray-900">Participants Preview</h4>
                      <p className="text-sm text-gray-500">
                        Showing {startIndex + 1}-{Math.min(endIndex, parsedParticipants.length)} of{' '}
                        {parsedParticipants.length} participant{parsedParticipants.length !== 1 ? 's' : ''} found
                        {parsedParticipants.some((p) => p.errors) && (
                          <span className="ml-2 text-red-500">• Some rows have errors</span>
                        )}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={downloadCSVTemplate}
                        className="inline-flex items-center rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        Download Template
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setParsedParticipants([]);
                          setError('');
                          setParseErrors([]);
                        }}
                        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                          />
                        </svg>
                        Upload Different File
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="max-h-96 overflow-auto" style={{ maxWidth: '90vw' }}>
                      <table className="divide-y divide-gray-200" style={{ minWidth: 2000 }}>
                        <thead className="sticky top-0 bg-gray-50">
                          <tr>
                            <th className="w-8 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              #
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Email
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Name
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              X Handle
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              LinkedIn
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Telegram
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Role
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Invest Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Check Size
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Stages
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              SEC Rules
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Organization
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Org Email
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Team Lead
                            </th>
                            <th className="w-12 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {currentParticipants.map((participant, index) => (
                            <tr
                              key={startIndex + index}
                              className={clsx('hover:bg-gray-50', participant.errors ? 'bg-red-50' : '')}
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                                {startIndex + index + 1}
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <input
                                    type="email"
                                    value={participant.email}
                                    onChange={(e) => updateParticipant(index, 'email', e.target.value)}
                                    className={clsx(
                                      'w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1',
                                      participant.errors?.some((e) => e.includes('email') || e.includes('Email'))
                                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                    )}
                                    placeholder="email@example.com"
                                  />
                                  {participant.errors
                                    ?.filter((e) => e.includes('email') || e.includes('Email'))
                                    .map((error, i) => (
                                      <p key={i} className="text-xs text-red-600">
                                        {error}
                                      </p>
                                    ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    value={participant.name}
                                    onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                                    className={clsx(
                                      'w-full rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1',
                                      participant.errors?.some((e) => e.includes('name') || e.includes('Name'))
                                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                                    )}
                                    placeholder="Full Name"
                                  />
                                  {participant.errors
                                    ?.filter((e) => e.includes('name') || e.includes('Name'))
                                    .map((error, i) => (
                                      <p key={i} className="text-xs text-red-600">
                                        {error}
                                      </p>
                                    ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={participant.twitterHandler || ''}
                                  onChange={(e) => updateParticipant(index, 'twitterHandler', e.target.value)}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="username"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={participant.linkedinHandler || ''}
                                  onChange={(e) => updateParticipant(index, 'linkedinHandler', e.target.value)}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="username"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={participant.telegramHandler || ''}
                                  onChange={(e) => updateParticipant(index, 'telegramHandler', e.target.value)}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="username"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={participant.role || ''}
                                  onChange={(e) => updateParticipant(index, 'role', e.target.value)}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Lead, Contributor"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={participant.investmentType || ''}
                                  onChange={(e) =>
                                    updateParticipant(
                                      index,
                                      'investmentType',
                                      e.target.value as 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null
                                    )
                                  }
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">Select type</option>
                                  <option value="ANGEL">Angel</option>
                                  <option value="FUND">Fund</option>
                                  <option value="ANGEL_AND_FUND">Angel + Fund</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={participant.typicalCheckSize || ''}
                                  onChange={(e) =>
                                    updateParticipant(
                                      index,
                                      'typicalCheckSize',
                                      e.target.value ? parseFloat(e.target.value) : null
                                    )
                                  }
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="50000"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={participant.investInStartupStages?.join(',') || ''}
                                  onChange={(e) =>
                                    updateParticipant(
                                      index,
                                      'investInStartupStages',
                                      e.target.value
                                        ? e.target.value
                                            .split(',')
                                            .map((s) => s.trim())
                                            .filter((s) => s)
                                        : null
                                    )
                                  }
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Pre-seed|Seed"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={participant.secRulesAccepted ? 'true' : 'false'}
                                  onChange={(e) =>
                                    updateParticipant(index, 'secRulesAccepted', e.target.value === 'true')
                                  }
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="false">No</option>
                                  <option value="true">Yes</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={participant.organization || ''}
                                  onChange={(e) => updateParticipant(index, 'organization', e.target.value)}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Organization"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="email"
                                  value={participant.organizationEmail || ''}
                                  onChange={(e) => updateParticipant(index, 'organizationEmail', e.target.value)}
                                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="contact@org.com"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="space-y-2">
                                  <label className="flex items-center justify-center space-x-1">
                                    <input
                                      type="checkbox"
                                      checked={participant.makeTeamLead || false}
                                      onChange={(e) => updateParticipant(index, 'makeTeamLead', e.target.checked)}
                                      className="h-3 w-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-xs text-gray-600">
                                      <div
                                        className={clsx(
                                          'rounded-full px-2 py-1 text-center text-xs',
                                          participant.makeTeamLead
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-600'
                                        )}
                                      >
                                        {participant.makeTeamLead ? 'Yes' : 'No'}
                                      </div>
                                    </span>
                                  </label>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeParticipant(index)}
                                  className="text-red-400 hover:text-red-600 focus:outline-none"
                                  title="Remove participant"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M6 18L18 6M6 6l12 12"
                                    />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="mt-4 flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="flex flex-1 justify-between sm:hidden">
                          <button
                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm text-gray-700">
                              Page <span className="font-medium">{currentPage}</span> of{' '}
                              <span className="font-medium">{totalPages}</span>
                            </p>
                          </div>
                          <div>
                            <nav
                              className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                              aria-label="Pagination"
                            >
                              <button
                                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
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

                              {/* Page numbers */}
                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const pageNumber = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                                return (
                                  <button
                                    key={pageNumber}
                                    onClick={() => setCurrentPage(pageNumber)}
                                    className={clsx(
                                      'relative inline-flex items-center px-4 py-2 text-sm font-semibold',
                                      pageNumber === currentPage
                                        ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                    )}
                                  >
                                    {pageNumber}
                                  </button>
                                );
                              })}

                              <button
                                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
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
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  isUploading ||
                  parsedParticipants.length === 0 ||
                  parsedParticipants.some((p) => p.errors && p.errors.length > 0) ||
                  addInvestorParticipantsBulkMutation.isPending ||
                  addTeamPitchParticipantsBulkMutation.isPending
                }
                className={clsx(
                  'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                  isUploading ||
                    parsedParticipants.length === 0 ||
                    parsedParticipants.some((p) => p.errors && p.errors.length > 0) ||
                    addInvestorParticipantsBulkMutation.isPending ||
                    addTeamPitchParticipantsBulkMutation.isPending
                    ? 'cursor-not-allowed bg-gray-400'
                    : 'bg-green-600 hover:bg-green-700'
                )}
              >
                {isUploading ? (
                  <>
                    <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Uploading {uploadProgress.current}/{uploadProgress.total}...
                  </>
                ) : (
                  <>
                    <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Upload {parsedParticipants.length} Participant{parsedParticipants.length !== 1 ? 's' : ''} (
                    {Math.ceil(parsedParticipants.length / itemsPerPage)} page
                    {Math.ceil(parsedParticipants.length / itemsPerPage) !== 1 ? 's' : ''})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Results Modal */}
      {showResultModal && uploadResult && (
        <UploadParticipantsResultModal
          isOpen={showResultModal}
          onClose={handleResultModalClose}
          result={uploadResult}
          participantType="INVESTOR"
        />
      )}
    </>
  );
};
