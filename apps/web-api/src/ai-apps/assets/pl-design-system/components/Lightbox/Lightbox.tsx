'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { LightboxProps } from './Lightbox.types';
import styles from './Lightbox.module.scss';

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <polyline
        points="13,4 7,10 13,16"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <polyline
        points="7,4 13,10 7,16"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Lightbox({
  images,
  initialIndex = 0,
  open,
  onOpenChange,
  children,
}: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setCurrentIndex(initialIndex);
  }, [open, initialIndex]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setCurrentIndex((i) => i - 1);
  }, [hasPrev]);

  const goNext = useCallback(() => {
    if (hasNext) setCurrentIndex((i) => i + 1);
  }, [hasNext]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    },
    [goPrev, goNext],
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const current = images[currentIndex];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children && <Dialog.Trigger asChild>{children}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay}>
          <Dialog.Content
            className={styles.content}
            aria-describedby={current?.caption ? 'lightbox-caption' : undefined}
          >
            <Dialog.Title className="sr-only">
              Image {currentIndex + 1} of {images.length}
            </Dialog.Title>

            {images.length > 1 && (
              <div className={styles.counter} aria-live="polite">
                {currentIndex + 1} / {images.length}
              </div>
            )}

            {current && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.image}
                  src={current.src}
                  alt={current.alt ?? `Image ${currentIndex + 1}`}
                />
                {current.caption && (
                  <p id="lightbox-caption" className={styles.caption}>
                    {current.caption}
                  </p>
                )}
              </>
            )}

            <Dialog.Close asChild>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Close lightbox"
              >
                <CloseIcon />
              </button>
            </Dialog.Close>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  className={clsx(styles.navButton, styles.prevButton)}
                  onClick={goPrev}
                  disabled={!hasPrev}
                  aria-label="Previous image"
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  className={clsx(styles.navButton, styles.nextButton)}
                  onClick={goNext}
                  disabled={!hasNext}
                  aria-label="Next image"
                >
                  <ChevronRightIcon />
                </button>
              </>
            )}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
