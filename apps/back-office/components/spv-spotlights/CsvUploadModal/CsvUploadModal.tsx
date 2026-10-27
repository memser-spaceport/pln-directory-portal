import React, { ReactNode } from 'react';
import clsx from 'clsx';
import { useDropzone } from 'react-dropzone';

import Modal from '../../modal/modal';

interface CsvUploadModalProps {
  isOpen: boolean;
  title: string;
  subtitle: string;
  showDropzone: boolean;
  dropzoneHint: ReactNode;
  dropzoneAction?: ReactNode;
  errors: string[];
  isBusy: boolean;
  submitLabel: string;
  isSubmitDisabled: boolean;
  onFileDrop: (file: File) => void;
  onSubmit: () => void;
  onClose: () => void;
  children?: ReactNode;
}

export const CsvUploadModal: React.FC<CsvUploadModalProps> = (props) => {
  const {
    isOpen,
    title,
    subtitle,
    showDropzone,
    dropzoneHint,
    dropzoneAction,
    errors,
    isBusy,
    submitLabel,
    isSubmitDisabled,
    onFileDrop,
    onSubmit,
    onClose,
    children,
  } = props;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    onDrop: (accepted) => {
      if (accepted[0]) onFileDrop(accepted[0]);
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="max-w-10xl w-full rounded-lg bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>

        <div className="space-y-6 px-6 py-6">
          {showDropzone && (
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
              <p className="mt-4 text-xs text-gray-400">{dropzoneHint}</p>
              {/* A click inside the dropzone opens the file picker, so the action must not bubble up to it */}
              {dropzoneAction && <div onClick={(e) => e.stopPropagation()}>{dropzoneAction}</div>}
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}

          {children}
        </div>

        <div className="flex justify-end space-x-3 rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitDisabled}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm font-medium text-white',
              isSubmitDisabled ? 'cursor-not-allowed bg-gray-400' : 'bg-green-600 hover:bg-green-700'
            )}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
