'use client';

import { useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import type { UploadProps, UploadFile } from './Upload.types';
import styles from './Upload.module.scss';

function UploadIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 28V16M20 16L15 21M20 16L25 21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 30C7.24 30 5 27.76 5 25C5 22.57 6.75 20.55 9.07 20.1C9.03 19.74 9 19.37 9 19C9 14.58 12.58 11 17 11C20.07 11 22.75 12.65 24.19 15.1C24.78 15.04 25.39 15 26 15C30.42 15 34 18.58 34 23C34 27.42 30.42 31 26 31H10V30Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE';
}

function isImageFile(file: UploadFile): boolean {
  if (file.type) return file.type.startsWith('image/');
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

export function Upload({
  accept,
  multiple = false,
  maxSize,
  files = [],
  onFilesChange,
  onRemove,
  disabled = false,
  label = 'Click to upload or drag and drop',
  description,
  icon,
  className,
  ...props
}: UploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || !onFilesChange) return;
      const valid: File[] = [];

      Array.from(fileList).forEach((file) => {
        if (maxSize && file.size > maxSize) {
          setDropError(`"${file.name}" exceeds the size limit.`);
          return;
        }
        valid.push(file);
      });

      if (valid.length > 0) {
        setDropError(null);
        onFilesChange(valid);
      }
    },
    [maxSize, onFilesChange],
  );

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className={clsx(className)} {...props}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        className={clsx(styles.dropzone, {
          [styles.dragging]: isDragging,
          [styles.error]: !!dropError,
          [styles.disabled]: disabled,
        })}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {icon ?? <UploadIcon />}
        <span className={styles.label}>{label}</span>
        {description && <span className={styles.description}>{description}</span>}
        {dropError && <span className={styles.fileError}>{dropError}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        className={styles.hiddenInput}
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      {files.length > 0 && (
        <ul className={styles.fileList} aria-label="Uploaded files">
          {files.map((file) => (
            <li key={file.id} className={styles.fileItem}>
              <div className={styles.fileIcon} aria-hidden="true">
                {isImageFile(file) && file.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.url} alt={file.name} />
                ) : (
                  getFileExtension(file.name)
                )}
              </div>
              <div className={styles.fileInfo}>
                <div className={styles.fileName} title={file.name}>{file.name}</div>
                <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
                {file.progress !== undefined && file.progress < 100 && (
                  <div className={styles.progressBar} role="progressbar" aria-valuenow={file.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className={styles.progressFill} style={{ width: `${file.progress}%` }} />
                  </div>
                )}
                {file.error && <div className={styles.fileError}>{file.error}</div>}
              </div>
              {onRemove && (
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => onRemove(file.id)}
                  aria-label={`Remove ${file.name}`}
                >
                  <RemoveIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
