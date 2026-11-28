// jsdom has no Web Audio. This stands in for the browser's: an AudioContext that starts suspended (as a page's does
// before a gesture) and runs when `resume()` is called, whose nodes keep what they were set to and what they are
// connected to, so a test can read the level a player asked for and whether its element was routed. Nothing is heard;
// what the real graph does with these settings is checked in Chromium (see src/components/media-sound.ts).

export type FakeWebAudio = {
  contexts: FakeAudioContext[];
  /** The gains from the element to the speakers, multiplied: the level the player asked for (targets as if arrived). */
  level(el: HTMLMediaElement): number | null;
  /** Whether the element's sound has been taken into a context. */
  routed(el: HTMLMediaElement): boolean;
  /** Contexts refuse to start until this is called (no gesture yet). */
  holdStart(): void;
  allowStart(): void;
  uninstall(): void;
};

// As in a browser, a target set by `setTargetAtTime` is not the param's `.value` until audio time passes (never, while
// the context is suspended): `target` is what it is heading for, which is what a test reads.
class FakeParam {
  value: number;
  target: number | null = null;
  constructor(value: number) {
    this.value = value;
  }
  setTargetAtTime(target: number) {
    this.target = target;
    return this;
  }
  cancelScheduledValues() {
    this.target = null;
    return this;
  }
  get heading() {
    return this.target ?? this.value;
  }
}

class FakeNode {
  out: FakeNode[] = [];
  connect<T extends FakeNode>(node: T): T {
    this.out.push(node);
    return node;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
}

class FakeSource extends FakeNode {
  constructor(readonly element: HTMLMediaElement) {
    super();
  }
}

let held = false;
let all: FakeAudioContext[] = [];

class FakeAudioContext extends EventTarget {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  constructor() {
    super();
    all.push(this);
  }
  createGain() {
    return new FakeGain();
  }
  createDynamicsCompressor() {
    return new FakeCompressor();
  }
  createMediaElementSource(el: HTMLMediaElement) {
    if (all.some((c) => c.sources.some((s) => s.element === el)))
      throw new DOMException("already connected to a source node", "InvalidStateError");
    const s = new FakeSource(el);
    this.sources.push(s);
    return s;
  }
  suspend() {
    if (this.state === "running") {
      this.state = "suspended";
      this.dispatchEvent(new Event("statechange"));
    }
    return Promise.resolve();
  }
  resume() {
    if (!held && this.state !== "running") {
      this.state = "running";
      this.dispatchEvent(new Event("statechange"));
    }
    return Promise.resolve();
  }
}

function product(node: FakeNode, to: FakeNode): number | null {
  if (node === to) return 1;
  for (const next of node.out) {
    const rest = product(next, to);
    if (rest !== null) return rest * (next instanceof FakeGain ? next.gain.heading : 1);
  }
  return null;
}

/** Puts a fake `AudioContext` on `window` until `uninstall()`. */
export function installFakeWebAudio(): FakeWebAudio {
  const had = (window as { AudioContext?: unknown }).AudioContext;
  (window as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
  all = [];
  held = false;
  const sourceOf = (el: HTMLMediaElement) =>
    all.flatMap((c) => c.sources.map((s) => ({ c, s }))).find(({ s }) => s.element === el);
  return {
    get contexts() {
      return all;
    },
    level(el) {
      const found = sourceOf(el);
      return found ? product(found.s, found.c.destination) : null;
    },
    routed: (el) => sourceOf(el) !== undefined,
    holdStart: () => void (held = true),
    allowStart: () => {
      held = false;
      for (const c of all) void c.resume();
    },
    uninstall() {
      (window as { AudioContext?: unknown }).AudioContext = had;
      all = [];
    },
  };
}
