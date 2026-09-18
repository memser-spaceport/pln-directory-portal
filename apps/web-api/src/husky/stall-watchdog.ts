/**
 * Aborts a model request once no chunk has arrived for `timeoutMs`.
 *
 * A provider stream that stops delivering data without closing the connection
 * would otherwise keep the HTTP response open indefinitely. Every chunk calls
 * `touch()` to restart the window; `stop()` disarms it once the stream is done.
 */
export class StallWatchdog {
  private readonly controller = new AbortController();
  private timer?: NodeJS.Timeout;
  private _stalled = false;

  constructor(readonly timeoutMs: number) {
    this.touch();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** True once the watchdog itself aborted the request. */
  get stalled(): boolean {
    return this._stalled;
  }

  touch(): void {
    this.stop();
    this.timer = setTimeout(() => {
      this._stalled = true;
      this.controller.abort();
    }, this.timeoutMs);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Resolves with `promise`, or rejects when the watchdog fires first. Used for
   * promises the SDK derives from an aborted stream, which may never settle.
   */
  race<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new StallError(this.timeoutMs));
      if (this.signal.aborted) {
        abort();
        return;
      }
      this.signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => this.signal.removeEventListener('abort', abort));
    });
  }
}

export class StallError extends Error {
  constructor(timeoutMs: number) {
    super(`No data received from the AI provider for ${timeoutMs}ms`);
    this.name = 'StallError';
  }
}
