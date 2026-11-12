// jsdom has no media engine: an <audio> never loads, plays or reports a time. This gives its
// prototype the parts of one a player reads, driven by the test, so the real component and the
// real element's events run: `load()` and `play()` set state and fire the events a browser does.
// Nothing here replaces our code; it plays the part of the browser's decoder.
export type FakeMedia = {
  /** Finish loading: sets the duration and fires loadedmetadata, durationchange and canplay. */
  loaded: (el: HTMLMediaElement, duration: number) => void;
  /** Plays to the end. */
  end: (el: HTMLMediaElement) => void;
  /** Sets the time and fires timeupdate. */
  tick: (el: HTMLMediaElement, time: number) => void;
  /** The element has not got its next frames (readyState 1): a stall. `loaded` again clears it. */
  stall: (el: HTMLMediaElement) => void;
  /** Fails the load with a MediaError code (4: not supported or not found). */
  fail: (el: HTMLMediaElement, code: number) => void;
  /** Makes the next play() reject, as a browser does when autoplay is refused. */
  refuseNextPlay: () => void;
  plays: number;
  loads: number;
  uninstall: () => void;
};

type State = { duration: number; time: number; paused: boolean; ended: boolean; error: { code: number } | null; volume: number; muted: boolean; rate: number; defaultRate: number; ready: number; network: number };
const states = new WeakMap<HTMLMediaElement, State>();
const stateOf = (el: HTMLMediaElement): State => {
  let s = states.get(el);
  if (!s) states.set(el, (s = { duration: NaN, time: 0, paused: true, ended: false, error: null, volume: 1, muted: false, rate: 1, defaultRate: 1, ready: 0, network: 0 }));
  return s;
};

export function installFakeMedia(): FakeMedia {
  const proto = HTMLMediaElement.prototype;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const define = (name: string, descriptor: PropertyDescriptor) => {
    saved.set(name, Object.getOwnPropertyDescriptor(proto, name));
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });
  };
  const fake = { plays: 0, loads: 0, refuse: false } as { plays: number; loads: number; refuse: boolean };
  const fire = (el: HTMLMediaElement, ...types: string[]) => types.forEach((t) => el.dispatchEvent(new Event(t)));

  define("duration", { get(this: HTMLMediaElement) { return stateOf(this).duration; } });
  define("currentTime", {
    get(this: HTMLMediaElement) { return stateOf(this).time; },
    set(this: HTMLMediaElement, v: number) { const st = stateOf(this); st.time = v; st.ended = false; fire(this, "seeking", "seeked", "timeupdate"); },
  });
  define("paused", { get(this: HTMLMediaElement) { return stateOf(this).paused; } });
  define("ended", { get(this: HTMLMediaElement) { return stateOf(this).ended; } });
  define("error", { get(this: HTMLMediaElement) { return stateOf(this).error; } });
  define("readyState", { get(this: HTMLMediaElement) { return stateOf(this).ready; } });
  define("networkState", { get(this: HTMLMediaElement) { return stateOf(this).network; } });
  define("buffered", { get(this: HTMLMediaElement) { const s = stateOf(this); return { length: s.ready ? 1 : 0, start: () => 0, end: () => Math.min(s.duration, s.time + 30) }; } });
  define("volume", { get(this: HTMLMediaElement) { return stateOf(this).volume; }, set(this: HTMLMediaElement, v: number) { stateOf(this).volume = v; fire(this, "volumechange"); } });
  define("muted", { get(this: HTMLMediaElement) { return stateOf(this).muted; }, set(this: HTMLMediaElement, v: boolean) { stateOf(this).muted = v; fire(this, "volumechange"); } });
  define("playbackRate", { get(this: HTMLMediaElement) { return stateOf(this).rate; }, set(this: HTMLMediaElement, v: number) { stateOf(this).rate = v; fire(this, "ratechange"); } });
  define("defaultPlaybackRate", { get(this: HTMLMediaElement) { return stateOf(this).defaultRate; }, set(this: HTMLMediaElement, v: number) { stateOf(this).defaultRate = v; } });
  define("load", {
    value(this: HTMLMediaElement) {
      fake.loads++;
      const s = stateOf(this);
      // The load algorithm resets the rate to the default, as a browser does.
      Object.assign(s, { duration: NaN, time: 0, ended: false, error: null, ready: 0, network: 2, rate: s.defaultRate });
      fire(this, "emptied", "loadstart");
    },
  });
  define("play", {
    value(this: HTMLMediaElement) {
      fake.plays++;
      if (fake.refuse) {
        fake.refuse = false;
        return Promise.reject(new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError"));
      }
      const s = stateOf(this);
      if (s.ended) Object.assign(s, { ended: false, time: 0 });
      s.paused = false;
      fire(this, "play", "playing");
      return Promise.resolve();
    },
  });
  define("pause", {
    value(this: HTMLMediaElement) {
      const s = stateOf(this);
      if (s.paused) return;
      s.paused = true;
      fire(this, "pause");
    },
  });

  return {
    loaded(el, duration) {
      Object.assign(stateOf(el), { duration, ready: 4, network: 1 });
      fire(el, "loadedmetadata", "durationchange", "canplay");
    },
    end(el) {
      const s = stateOf(el);
      Object.assign(s, { time: s.duration, ended: true, paused: true });
      fire(el, "timeupdate", "pause", "ended");
    },
    tick(el, time) {
      stateOf(el).time = time;
      fire(el, "timeupdate");
    },
    stall(el) {
      stateOf(el).ready = 1;
      fire(el, "waiting");
    },
    fail(el, code) {
      Object.assign(stateOf(el), { error: { code }, network: 3 });
      fire(el, "error");
    },
    refuseNextPlay: () => void (fake.refuse = true),
    get plays() { return fake.plays; },
    get loads() { return fake.loads; },
    uninstall() {
      for (const [name, d] of saved) {
        if (d) Object.defineProperty(proto, name, d);
        else delete (proto as unknown as Record<string, unknown>)[name];
      }
    },
  };
}
