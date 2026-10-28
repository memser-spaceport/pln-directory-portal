/**
 * Enable `@testing-library/jest-dom` matchers such as toHaveTextContent or toHaveAttribute.
 */
import '@testing-library/jest-dom';

/**
 * jsdom has no ResizeObserver; Headless UI uses it to follow the position of Listbox and Popover buttons.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
