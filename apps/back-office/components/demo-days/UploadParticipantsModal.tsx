import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Modal from '../modal/modal';
import { useCookie } from 'react-use';
import { useAddParticipantsBulk } from '../../hooks/demo-days/useAddParticipantsBulk';
import clsx from 'clsx';

interface UploadParticipantsModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoDayUid: string;
}

interface ParsedParticipant {
  email: string;
  name?: string;
}

export const UploadParticipantsModal: React.FC<UploadParticipantsModalProps> = ({ isOpen, onClose, demoDayUid }) => {
  const [authToken] = useCookie('plnadmin');
  const [participantType, setParticipantType] = useState<'INVESTOR' | 'FOUNDER'>('INVESTOR');
  const [parsedParticipants, setParsedParticipants] = useState<ParsedParticipant[]>([]);
  const [error, setError] = useState<string>('');

  const addParticipantsBulkMutation = useAddParticipantsBulk();

  const parseCSV = (csvContent: string): ParsedParticipant[] => {
    const lines = csvContent.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0]
      .toLowerCase()
      .split(',')
      .map((h) => h.trim());
    const emailIndex = headers.findIndex((h) => h.includes('email'));
    const nameIndex = headers.findIndex((h) => h.includes('name'));

    if (emailIndex === -1) {
      throw new Error('CSV must contain an "email" column');
    }

    const participants: ParsedParticipant[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
      if (values[emailIndex]) {
        participants.push({
          email: values[emailIndex],
          name: nameIndex !== -1 && values[nameIndex] ? values[nameIndex] : undefined,
        });
      }
    }

    return participants;
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvContent = e.target?.result as string;
        const participants = parseCSV(csvContent);
        setParsedParticipants(participants);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse CSV');
        setParsedParticipants([]);
      }
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  const handleSubmit = async () => {
    if (!authToken || parsedParticipants.length === 0) return;

    try {
      await addParticipantsBulkMutation.mutateAsync({
        authToken,
        demoDayUid,
        data: {
          members: parsedParticipants,
          type: participantType,
        },
      });

      // Reset form
      setParsedParticipants([]);
      setError('');
      onClose();
    } catch (error) {
      console.error('Error uploading participants:', error);
      alert('Failed to upload participants. Please try again.');
    }
  };

  const handleClose = () => {
    setParsedParticipants([]);
    setError('');
    onClose();
  };

  const removeParticipant = (index: number) => {
    setParsedParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const updateParticipant = (index: number, field: 'email' | 'name', value: string) => {
    setParsedParticipants((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Upload Participants CSV</h3>
              <p className="mt-1 text-sm text-gray-500">Bulk upload participants from a CSV file</p>
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
            {/* Participant Type */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Participant Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={clsx(
                    'flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 transition-all',
                    participantType === 'INVESTOR'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  <input
                    type="radio"
                    value="INVESTOR"
                    checked={participantType === 'INVESTOR'}
                    onChange={(e) => setParticipantType(e.target.value as 'INVESTOR' | 'FOUNDER')}
                    className="sr-only"
                  />
                  <div className="flex items-center">
                    <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-current">
                      {participantType === 'INVESTOR' && <div className="h-2 w-2 rounded-full bg-current"></div>}
                    </div>
                    Investor
                  </div>
                </label>
                <label
                  className={clsx(
                    'flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 transition-all',
                    participantType === 'FOUNDER'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  <input
                    type="radio"
                    value="FOUNDER"
                    checked={participantType === 'FOUNDER'}
                    onChange={(e) => setParticipantType(e.target.value as 'INVESTOR' | 'FOUNDER')}
                    className="sr-only"
                  />
                  <div className="flex items-center">
                    <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-current">
                      {participantType === 'FOUNDER' && <div className="h-2 w-2 rounded-full bg-current"></div>}
                    </div>
                    Founder
                  </div>
                </label>
              </div>
            </div>

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
                    <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span>CSV files only • Required: email column • Optional: name column</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center">
                  <svg className="mr-2 h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span className="text-sm text-red-600">{error}</span>
                </div>
              </div>
            )}

            {/* Parsed Participants */}
            {parsedParticipants.length > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-medium text-gray-900">Parsed Participants</h4>
                    <p className="text-sm text-gray-500">
                      {parsedParticipants.length} participant{parsedParticipants.length !== 1 ? 's' : ''} found
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedParticipants([]);
                      setError('');
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
                <div className="rounded-lg border border-gray-200 bg-gray-50">
                  <div className="max-h-80 overflow-y-auto">
                    <div className="divide-y divide-gray-200">
                      {parsedParticipants.map((participant, index) => (
                        <div key={index} className="p-4 transition-colors hover:bg-white">
                          <div className="flex items-start space-x-4">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                              <span className="text-sm font-medium text-blue-600">{index + 1}</span>
                            </div>
                            <div className="flex-1 space-y-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">
                                  Email Address <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="email"
                                  value={participant.email}
                                  onChange={(e) => updateParticipant(index, 'email', e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter email address"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-700">Full Name</label>
                                <input
                                  type="text"
                                  value={participant.name || ''}
                                  onChange={(e) => updateParticipant(index, 'name', e.target.value)}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter full name (optional)"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeParticipant(index)}
                              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
              disabled={addParticipantsBulkMutation.isPending || parsedParticipants.length === 0}
              className={clsx(
                'inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                addParticipantsBulkMutation.isPending || parsedParticipants.length === 0
                  ? 'cursor-not-allowed bg-gray-400'
                  : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {addParticipantsBulkMutation.isPending ? (
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
                  Uploading...
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
                  Upload {parsedParticipants.length} Participant{parsedParticipants.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
