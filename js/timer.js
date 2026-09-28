// timer.js — cronómetro de turno, sin DOM, testeable.
export function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export class Timer {
  constructor(options = {}) {
    const {
      seconds = 60,
      onTick = () => {},
      onEnd = () => {},
      now = () => Date.now(),
      setIntervalFn = (fn, ms) => setInterval(fn, ms),
      clearIntervalFn = (id) => clearInterval(id),
      intervalMs = 100,
    } = options;

    this.totalSeconds = seconds;
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.now = now;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.intervalMs = intervalMs;

    this.remainingMs = seconds * 1000;
    this.running = false;
    this.intervalId = null;
    this.lastTick = 0;
  }

  get remaining() {
    return this.remainingMs / 1000;
  }

  get isRunning() {
    return this.running;
  }

  start(seconds) {
    if (typeof seconds === 'number') this.totalSeconds = seconds;
    if (this.remainingMs <= 0) this.remainingMs = Math.max(1, this.totalSeconds) * 1000;
    if (this.running) return;
    this.running = true;
    this.lastTick = this.now();
    this.intervalId = this.setIntervalFn(() => this.tick(), this.intervalMs);
    this.onTick(this.remaining);
  }

  tick() {
    if (!this.running) return;
    const current = this.now();
    const delta = current - this.lastTick;
    this.lastTick = current;
    this.remainingMs -= delta;

    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.stop();
      this.onTick(0);
      this.onEnd();
      return;
    }
    this.onTick(this.remaining);
  }

  pause() {
    if (!this.running) return;
    this.stop();
  }

  resume() {
    if (this.running || this.remainingMs <= 0) return;
    this.start();
  }

  toggle() {
    if (this.running) this.pause();
    else this.resume();
  }

  addSeconds(seconds) {
    this.remainingMs += seconds * 1000;
    this.totalSeconds = Math.max(this.totalSeconds, this.remaining);
    this.onTick(this.remaining);
  }

  stop() {
    if (this.intervalId !== null) {
      this.clearIntervalFn(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }

  reset(seconds) {
    this.stop();
    this.totalSeconds = seconds ?? this.totalSeconds;
    this.remainingMs = this.totalSeconds * 1000;
    this.onTick(this.remaining);
  }
}
