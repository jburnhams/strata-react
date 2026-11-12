import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { PanoramaViewer, type PanoramaView, type PanoramaViewerProps } from "../../src/panorama";
import { project } from "../../src/panorama/projection";
import { installFakeIntersectionObserver, renderWithStrata } from "../../src/testing";
import { installFakeGl, installFakeImages, type FakeGl } from "../utils/gl";

// Issue #178: the viewer's controls, its drawing and its fallback, with the GPU stood in for
// (tests/utils/gl.ts). The projection maths has its own tests with no component at all.

let gl: FakeGl;
let restoreImages: () => void;
beforeEach(() => {
  gl = installFakeGl();
  restoreImages = installFakeImages();
  // A frame is a microtask later, so a test can look at what was drawn.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  gl.uninstall();
  restoreImages();
  vi.unstubAllGlobals();
});

// The picture loads after the render (a microtask), so its state update lands in the next act; a frame is a timer after that.
const frames = async () => {
  for (let i = 0; i < 3; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 15))));
};
const group = () => screen.getByRole("group", { name: "360 view of the room" });
const deg = (rad: number) => (rad * 180) / Math.PI;

function Host(props: Partial<PanoramaViewerProps> & { onView?: (v: PanoramaView) => void }) {
  return <PanoramaViewer label="360 view of the room" image="/room.jpg" onViewChange={props.onView} {...(props as object)} />;
}

describe("drawing", () => {
  it("draws the view's yaw, pitch and field of view once the picture has loaded, and uploads a still once", async () => {
    renderWithStrata(<Host view={{ yaw: 40, pitch: 10, fov: 70 }} />);
    await frames();
    expect(gl.uploads).toBe(1);
    expect(gl.draws).toBeGreaterThan(0);
    expect(deg(gl.uniforms.uYaw)).toBeCloseTo(40);
    expect(deg(gl.uniforms.uPitch)).toBeCloseTo(10);
    expect(gl.uniforms.uTanHalf).toBeCloseTo(Math.tan((35 * Math.PI) / 180));
  });

  it("draws a view set from outside at once, with no animation, and does not upload the still again", async () => {
    const { rerender } = renderWithStrata(<Host view={{ yaw: 0, pitch: 0, fov: 90 }} />);
    await frames();
    const uploads = gl.uploads;
    rerender(<Host view={{ yaw: -120, pitch: 30, fov: 50 }} />);
    await frames();
    expect(deg(gl.uniforms.uYaw)).toBeCloseTo(-120);
    expect(deg(gl.uniforms.uPitch)).toBeCloseTo(30);
    expect(gl.uploads).toBe(uploads);
  });

  it("names the picture by its label and where it looks, always current", () => {
    renderWithStrata(<Host view={{ yaw: 40, pitch: 5, fov: 90 }} />);
    expect(screen.getByRole("img", { name: "360 view of the room. Looking 40° right, 5° up, field of view 90°" })).toBeInTheDocument();
  });

  it("draws nothing while it is off screen, and catches up when it comes back", async () => {
    const io = installFakeIntersectionObserver();
    try {
      renderWithStrata(<Host />);
      io.intersect(group(), false);
      await frames();
      const draws = gl.draws;
      fireEvent.keyDown(group(), { key: "ArrowRight" });
      await frames();
      expect(gl.draws).toBe(draws);
      io.intersect(group(), true);
      await frames();
      expect(gl.draws).toBeGreaterThan(draws);
    } finally {
      io.uninstall();
    }
  });
});

describe("a video the app owns", () => {
  function Playing({ onUpload }: { onUpload?: () => void }) {
    const ref = React.useRef<HTMLVideoElement>(null);
    React.useLayoutEffect(() => {
      const v = ref.current as unknown as Record<string, unknown>;
      Object.defineProperty(v, "readyState", { value: 4, configurable: true });
      Object.defineProperty(v, "videoWidth", { value: 2048, configurable: true });
      let cb: ((now: number, meta: object) => void) | null = null;
      v.requestVideoFrameCallback = (fn: typeof cb) => {
        cb = fn;
        return 1;
      };
      v.cancelVideoFrameCallback = () => {};
      (window as unknown as { nextFrame: () => void }).nextFrame = () => {
        const f = cb;
        cb = null;
        f?.(0, {});
        onUpload?.();
      };
    }, [onUpload]);
    return (
      <>
        <video ref={ref} />
        <PanoramaViewer label="360 view of the room" video={ref} />
      </>
    );
  }
  it("uploads one texture per frame the video shows, and not for a redraw of the same frame", async () => {
    renderWithStrata(<Playing />);
    await frames();
    const start = gl.uploads;
    act(() => (window as unknown as { nextFrame: () => void }).nextFrame());
    await frames();
    act(() => (window as unknown as { nextFrame: () => void }).nextFrame());
    await frames();
    expect(gl.uploads).toBe(start + 2);
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    await frames();
    expect(gl.uploads).toBe(start + 2); // the view moved; the frame did not
  });
});

describe("controls", () => {
  it("pans with the arrow keys, more with Shift, and keeps inside maxPitch", () => {
    const onView = vi.fn();
    renderWithStrata(<Host onView={onView} defaultView={{ yaw: 0, pitch: 0, fov: 90 }} maxPitch={30} />);
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(onView).toHaveBeenLastCalledWith({ yaw: 7.5, pitch: 0, fov: 90 });
    fireEvent.keyDown(group(), { key: "ArrowLeft", shiftKey: true });
    expect(onView.mock.lastCall![0].yaw).toBeCloseTo(7.5 - 22.5);
    for (let i = 0; i < 10; i++) fireEvent.keyDown(group(), { key: "ArrowUp" });
    expect(onView.mock.lastCall![0].pitch).toBe(30);
  });

  it("zooms with + and -, within the limits, and goes home with 0", () => {
    const onView = vi.fn();
    renderWithStrata(<Host onView={onView} defaultView={{ yaw: 20, pitch: 5, fov: 90 }} minFov={30} maxFov={100} />);
    fireEvent.keyDown(group(), { key: "+" });
    expect(onView.mock.lastCall![0].fov).toBeCloseTo(72);
    for (let i = 0; i < 6; i++) fireEvent.keyDown(group(), { key: "+" });
    expect(onView.mock.lastCall![0].fov).toBe(30);
    for (let i = 0; i < 10; i++) fireEvent.keyDown(group(), { key: "-" });
    expect(onView.mock.lastCall![0].fov).toBe(100);
    fireEvent.keyDown(group(), { key: "0" });
    expect(onView.mock.lastCall![0]).toEqual({ yaw: 20, pitch: 5, fov: 90 });
  });

  it("holds its own view when the app does not, and the app's view when it does", async () => {
    const { rerender } = renderWithStrata(<Host />);
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    await frames();
    expect(deg(gl.uniforms.uYaw)).toBeCloseTo(7.5);
    rerender(<Host view={{ yaw: 0, pitch: 0, fov: 90 }} />);
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    await frames();
    expect(deg(gl.uniforms.uYaw)).toBeCloseTo(0); // controlled: the app did not change it
  });

  it("drags the picture with the pointer: dragging right turns the view left; a small move is a click", () => {
    const onView = vi.fn();
    const onPick = vi.fn();
    renderWithStrata(<Host onView={onView} onPick={onPick} defaultView={{ yaw: 0, pitch: 0, fov: 90 }} />);
    const el = group();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 200, button: 0 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 340, clientY: 200 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 340, clientY: 200 });
    expect(onView.mock.lastCall![0].yaw).toBeLessThan(0);
    expect(onPick).not.toHaveBeenCalled();
    const dragged = onView.mock.lastCall![0] as PanoramaView;
    onView.mockClear();
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 320, clientY: 140, button: 0 });
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 321, clientY: 140 });
    expect(onView).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledTimes(1);
    // The middle of the 640 wide box, so the direction it looks in (the view the drag left it at).
    expect(Math.abs(onPick.mock.lastCall![0].yaw - dragged.yaw)).toBeLessThan(1);
  });

  it("zooms with the wheel (and does not let the page scroll), unless turned off", () => {
    const onView = vi.fn();
    const { unmount } = renderWithStrata(<Host onView={onView} />);
    const event = new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true });
    group().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onView.mock.lastCall![0].fov).toBeLessThan(90);
    unmount();
    renderWithStrata(<Host wheelZoom={false} />);
    const other = new WheelEvent("wheel", { deltaY: -200, bubbles: true, cancelable: true });
    group().dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it("pinches with two pointers", () => {
    const onView = vi.fn();
    renderWithStrata(<Host onView={onView} />);
    const el = group();
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 200, clientY: 100, button: 0 });
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 300, clientY: 100, button: 0 });
    fireEvent.pointerMove(el, { pointerId: 2, clientX: 400, clientY: 100 }); // fingers apart: zoom in
    expect(onView.mock.lastCall![0].fov).toBeLessThan(90);
  });

  it("has a field-of-view slider when asked, that changes the field of view", () => {
    const onView = vi.fn();
    renderWithStrata(<Host onView={onView} fovSlider />);
    const slider = screen.getByRole("slider", { name: "Field of view" });
    fireEvent.change(slider, { target: { value: "60" } });
    expect(onView.mock.lastCall![0].fov).toBe(60);
  });
});

describe("said in words", () => {
  it("announces the direction politely once the view has been still, not on every change", () => {
    vi.useFakeTimers();
    try {
      renderWithStrata(<Host defaultView={{ yaw: 0, pitch: 0, fov: 90 }} />);
      fireEvent.keyDown(group(), { key: "ArrowRight" });
      fireEvent.keyDown(group(), { key: "ArrowRight" });
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      act(() => void vi.advanceTimersByTime(700));
      expect(screen.getByRole("status")).toHaveTextContent("Looking 15° right, field of view 90°");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("overlay", () => {
  it("is given project and unproject for the picture's coordinates, and a marker stays on its direction while the view pans", () => {
    const seen: { x: number; y: number }[] = [];
    const overlay: PanoramaViewerProps["overlay"] = ({ project: p }) => {
      const at = p(30, 0);
      if (at) seen.push({ x: at.x, y: at.y });
      return at ? <span data-testid="marker" style={{ left: at.x, top: at.y }} /> : null;
    };
    const { rerender } = renderWithStrata(<Host view={{ yaw: 0, pitch: 0, fov: 90 }} overlay={overlay} />);
    const size = { width: 640, height: 280 }; // the layout shim's box
    const expected = project({ yaw: 0, pitch: 0, fov: 90 }, size, 30, 0)!;
    expect(seen.at(-1)!.x).toBeCloseTo(expected.x, 4);
    rerender(<Host view={{ yaw: 30, pitch: 0, fov: 90 }} overlay={overlay} />);
    expect(seen.at(-1)!.x).toBeCloseTo(320, 4); // looking at it: the middle
  });
  it("gives nothing for a direction behind the camera", () => {
    let behind: unknown = "unset";
    renderWithStrata(<Host view={{ yaw: 0, pitch: 0, fov: 90 }} overlay={({ project: p }) => ((behind = p(180, 0)), null)} />);
    expect(behind).toBeNull();
  });
});

describe("the GL context", () => {
  it("sends the picture again and redraws when a lost context is restored", async () => {
    renderWithStrata(<Host />);
    await frames();
    const uploads = gl.uploads;
    const canvas = gl.canvas()!;
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    await frames();
    expect(gl.uploads).toBeGreaterThan(uploads);
  });
});

describe("with no WebGL2", () => {
  it("says so, draws the flat picture cropped to the window with the same controls, and places overlay markers on the flat drawing", async () => {
    gl.uninstall();
    gl = installFakeGl({ webgl2: false });
    let flat: ReturnType<NonNullable<PanoramaViewerProps["overlay"]>> | boolean = false;
    let at: { x: number; y: number } | null = null;
    const onView = vi.fn();
    renderWithStrata(<Host onView={onView} view={{ yaw: 0, pitch: 0, fov: 90 }} overlay={({ flat: f, project: p }) => ((flat = f), (at = p(45, 0)), null)} />);
    await frames();
    expect(screen.getByText(/cannot draw the 360 view/)).toBeInTheDocument();
    expect(gl.drawImages.length).toBeGreaterThan(0);
    expect(flat).toBe(true);
    expect(at!.x).toBeCloseTo(640, 4); // 45 degrees right of centre of a 90 degree window
    fireEvent.keyDown(group(), { key: "ArrowRight" });
    expect(onView).toHaveBeenCalled();
  });
});
