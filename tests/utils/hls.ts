// A stand-in for the hls.js engine, for the parts of strata-react that drive one. hls.js needs Media
// Source Extensions, which jsdom has not; this plays the engine's side of the contract the attacher
// uses (construct with a config, loadSource, attachMedia, events, startLoad, recoverMediaError,
// destroy) and lets a test make it fail the way the real one does. The attacher, the player and the
// element's events are the real ones. The real engine runs in Storybook's stories, in Chromium.
export type Listener = (event: string, data: Record<string, unknown>) => void;

export function fakeHlsEngine() {
  const log = { created: [] as FakeHls[], destroyed: 0 };
  class FakeHls {
    static Events = { ERROR: "hlsError", FRAG_LOADED: "hlsFragLoaded" } as const;
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError", OTHER_ERROR: "otherError" } as const;
    static supported = true;
    static isSupported() {
      return FakeHls.supported;
    }
    listeners = new Map<string, Listener[]>();
    source = "";
    media: HTMLMediaElement | null = null;
    startLoads = 0;
    recoveries = 0;
    destroyed = false;
    constructor(public config: Record<string, unknown>) {
      log.created.push(this);
    }
    on(event: string, fn: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]);
    }
    loadSource(src: string) {
      this.source = src;
    }
    attachMedia(el: HTMLMediaElement) {
      this.media = el;
    }
    startLoad() {
      this.startLoads++;
    }
    recoverMediaError() {
      this.recoveries++;
    }
    destroy() {
      this.destroyed = true;
      log.destroyed++;
    }
    emit(event: string, data: Record<string, unknown> = {}) {
      for (const fn of this.listeners.get(event) ?? []) fn(event, data);
    }
    fail(type: string, fatal = true) {
      this.emit("hlsError", { type, fatal });
    }
  }
  return { Engine: FakeHls as unknown as typeof import("hls.js").default, FakeHls, log };
}
