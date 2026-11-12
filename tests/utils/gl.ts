// jsdom has no canvas and no GPU. This gives the canvas the parts of a WebGL2 context and a 2D context
// that `PanoramaViewer` calls, and keeps what it was told: the uniforms of the last draw, how many
// draws and texture uploads there were, and the 2D drawing. The viewer, its maths and its events are
// the real ones; this plays the GPU. The real shader runs in Chromium in Storybook and the visual suite.
export type FakeGl = {
  draws: number;
  uploads: number;
  /** The uniforms as last set: yaw and pitch in radians, tanHalf, aspect. */
  uniforms: Record<string, number>;
  /** 2D drawing: `drawImage` calls with their arguments. */
  drawImages: unknown[][];
  contexts: number;
  uninstall: () => void;
  canvas: () => HTMLCanvasElement | null;
};

export function installFakeGl({ webgl2 = true }: { webgl2?: boolean } = {}): FakeGl {
  const proto = HTMLCanvasElement.prototype;
  const saved = Object.getOwnPropertyDescriptor(proto, "getContext");
  const state = { draws: 0, uploads: 0, uniforms: {} as Record<string, number>, drawImages: [] as unknown[][], contexts: 0 };
  let last: HTMLCanvasElement | null = null;
  const names = new Map<unknown, string>();
  const gl = new Proxy(
    {
      getShaderParameter: () => true,
      getProgramParameter: () => true,
      getUniformLocation: (_p: unknown, name: string) => {
        const loc = { name };
        names.set(loc, name);
        return loc;
      },
      getAttribLocation: () => 0,
      uniform1f: (loc: unknown, value: number) => void (state.uniforms[names.get(loc) as string] = value),
      uniform1i: () => {},
      texImage2D: () => void state.uploads++,
      drawArrays: () => void state.draws++,
      createShader: () => ({}),
      createProgram: () => ({}),
      createBuffer: () => ({}),
      createTexture: () => ({}),
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key in target) return target[key];
        // Constants (gl.TEXTURE_2D…) are numbers; everything else is a function that does nothing.
        return /^[A-Z0-9_]+$/.test(key) ? 1 : () => {};
      },
    },
  );
  const ctx2d = { fillStyle: "", fillRect: () => {}, drawImage: (...args: unknown[]) => void state.drawImages.push(args) };
  Object.defineProperty(proto, "getContext", {
    configurable: true,
    value(this: HTMLCanvasElement, type: string) {
      last = this;
      state.contexts++;
      if (type === "webgl2") return webgl2 ? gl : null;
      if (type === "2d") return ctx2d;
      return null;
    },
  });
  return {
    get draws() { return state.draws; },
    get uploads() { return state.uploads; },
    get uniforms() { return state.uniforms; },
    get drawImages() { return state.drawImages; },
    get contexts() { return state.contexts; },
    canvas: () => last,
    uninstall() {
      if (saved) Object.defineProperty(proto, "getContext", saved);
      else delete (proto as unknown as Record<string, unknown>).getContext;
    },
  };
}

/** Makes an image load by itself when it is given a `src`, as a browser's decoder does: `naturalWidth` and `naturalHeight` are the picture's. */
export function installFakeImages(width = 2048, height = 1024): () => void {
  const proto = HTMLImageElement.prototype;
  const src = Object.getOwnPropertyDescriptor(proto, "src")!;
  const saved = (["naturalWidth", "naturalHeight"] as const).map((name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const);
  Object.defineProperty(proto, "src", {
    configurable: true,
    get(this: HTMLImageElement) {
      return src.get!.call(this);
    },
    set(this: HTMLImageElement, value: string) {
      src.set!.call(this, value);
      queueMicrotask(() => this.onload?.(new Event("load")));
    },
  });
  Object.defineProperty(proto, "naturalWidth", { configurable: true, get: () => width });
  Object.defineProperty(proto, "naturalHeight", { configurable: true, get: () => height });
  return () => {
    Object.defineProperty(proto, "src", src);
    for (const [name, d] of saved) {
      if (d) Object.defineProperty(proto, name, d);
    }
  };
}
