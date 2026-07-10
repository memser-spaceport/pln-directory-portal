'use client';

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  Children,
  type HTMLAttributes,
} from 'react';
import clsx from 'clsx';
import type { CarouselProps } from './Carousel.types';
import styles from './Carousel.module.scss';

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <polyline
        points="10,3 6,8 10,13"
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
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <polyline
        points="6,3 10,8 6,13"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Carousel({
  children,
  slidesToShow = 1,
  gap = 16,
  showArrows = true,
  showDots = false,
  loop = false,
  autoPlay,
  className,
  ...props
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slides = Children.toArray(children);
  const total = slides.length;
  const maxIndex = Math.max(0, total - slidesToShow);

  const hasPrev = loop ? total > slidesToShow : currentIndex > 0;
  const hasNext = loop ? total > slidesToShow : currentIndex < maxIndex;

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i <= 0) return loop ? maxIndex : 0;
      return i - 1;
    });
  }, [loop, maxIndex]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i >= maxIndex) return loop ? 0 : maxIndex;
      return i + 1;
    });
  }, [loop, maxIndex]);

  const goTo = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, maxIndex)));
  }, [maxIndex]);

  useEffect(() => {
    if (!autoPlay) return;
    autoPlayRef.current = setInterval(goNext, autoPlay);
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [autoPlay, goNext]);

  const slideWidth = `calc((100% - ${gap * (slidesToShow - 1)}px) / ${slidesToShow})`;
  const translateX = `calc(-${currentIndex} * (${slideWidth} + ${gap}px))`;

  return (
    <div className={clsx(styles.root, className)} {...props}>
      <div className={styles.viewport}>
        <div
          className={styles.track}
          style={{ transform: `translateX(${translateX})`, gap: `${gap}px` }}
          aria-live="polite"
        >
          {slides.map((slide, i) => (
            <div
              key={i}
              className={styles.slide}
              style={{ width: slideWidth }}
              aria-hidden={i < currentIndex || i >= currentIndex + slidesToShow}
            >
              {slide}
            </div>
          ))}
        </div>
      </div>

      {showArrows && total > slidesToShow && (
        <>
          <button
            type="button"
            className={styles.prevButton}
            onClick={goPrev}
            disabled={!hasPrev}
            aria-label="Previous slide"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className={styles.nextButton}
            onClick={goNext}
            disabled={!hasNext}
            aria-label="Next slide"
          >
            <ChevronRightIcon />
          </button>
        </>
      )}

      {showDots && total > slidesToShow && (
        <div className={styles.dots} role="tablist" aria-label="Carousel navigation">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === currentIndex}
              aria-label={`Go to slide ${i + 1}`}
              className={clsx(styles.dot, { [styles.active]: i === currentIndex })}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CarouselSlide({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
