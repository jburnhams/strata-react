import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SceneViewport, useOrbitCamera, type OrbitCamera, type SceneFrame, type SceneViewportHandle } from "../../src/scene";
import { renderWithStrata } from "../../src/testing";
import { installFakeGl, type FakeGl } from "../utils/gl";

// Issue #370: the frame and its input, with the GPU stood in for (tests/utils/gl.ts). The maths has its own tests.

let gl: FakeGl;
beforeEach(() => {
  gl = installFakeGl();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  gl.uninstall();
  vi.unstubAllGlobals();
});
const frames = async () => {
  for (let i = 0; i < 3; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 12))));
};

type Seen = { frames: SceneFrame[]; camera: OrbitCamera };
function Host({ mode, seen, onHandle, initial }: { mode?: "orbit" | "fly"; seen: Seen; onHandle?: (h: SceneViewportHandle | null) => void; initial?: Partial<OrbitCamera> }) {
  const { camera, setCamera, home } = useOrbitCamera(initial ?? { distance: 10, yaw: 0, pitch: 0 });
  seen.camera = camera;
  return (
    <SceneViewport
      label="Map e1m1"
      camera={camera}
      onCameraChange={setCamera}
      home={home}
      mode={mode}
      handle={onHandle}
      render={(_gl, frame) => void seen.frames.push(frame)}
    />
  );
}
const view = () => screen.getByRole("group", { name: "Map e1m1" });
const fresh = (): Seen => ({ frames: [], camera: undefined as never });

describe("drawing", () => {
  it("calls render with the matrices once the box is sized, and not on a timer", async () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    await frames();
    const count = seen.frames.length;
    expect(count).toBeGreaterThan(0);
    expect(seen.frames.at(-1)!.eye[2]).toBeCloseTo(-10);
    expect(seen.frames.at(-1)!.viewProjection).toHaveLength(16);
    await frames();
    expect(seen.frames.length).toBe(count);
  });

  it("draws again when the camera changes, and when asked", async () => {
    const seen = fresh();
    let handle: SceneViewportHandle | null = null;
    renderWithStrata(<Host seen={seen} onHandle={(h) => void (handle = h)} />);
    await frames();
    const before = seen.frames.length;
    await userEvent.click(view());
    await userEvent.keyboard("{ArrowRight}");
    await frames();
    expect(seen.frames.length).toBeGreaterThan(before);
    const again = seen.frames.length;
    act(() => handle!.invalidate());
    await frames();
    expect(seen.frames.length).toBe(again + 1);
  });

  it("counts a new context so the app recreates what lived on the lost one", async () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    await frames();
    const first = seen.frames.at(-1)!.context;
    const canvas = gl.canvas()!;
    act(() => void canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
    act(() => void canvas.dispatchEvent(new Event("webglcontextrestored")));
    await frames();
    expect(seen.frames.at(-1)!.context).toBe(first + 1);
  });

  it("says so, and draws no controls, where there is no WebGL", () => {
    gl.uninstall();
    const none = installFakeGl({ webgl2: false });
    renderWithStrata(<Host seen={fresh()} />);
    expect(screen.getByText("This browser cannot draw the 3D view.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reset view/ })).toBeNull();
    none.uninstall();
    gl = installFakeGl();
  });
});

describe("words", () => {
  it("names the canvas by the label and the camera, always current", async () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} initial={{ distance: 10, yaw: 0, pitch: 0 }} />);
    expect(screen.getByRole("img", { name: "Map e1m1. Looking at 0, 0, 0 from 10 away" })).toBeInTheDocument();
    await userEvent.click(view());
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("img", { name: /turned 3\.5° right|turned 4° right/ })).toBeInTheDocument();
  });
});

describe("input", () => {
  it("orbits by drag, pans by Shift-drag, and does nothing for a drag that never started", () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 50, clientY: 50 });
    expect(seen.camera.yaw).toBe(0);
    fireEvent.pointerDown(view(), { pointerId: 1, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 100, clientY: 0, buttons: 1 });
    expect(seen.camera.yaw).toBeGreaterThan(30);
    fireEvent.pointerUp(view(), { pointerId: 1 });
    fireEvent.pointerDown(view(), { pointerId: 2, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(view(), { pointerId: 2, clientX: 40, clientY: 0, buttons: 1, shiftKey: true });
    expect(seen.camera.target[0]).not.toBe(0);
  });

  it("pans by right drag", () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    fireEvent.pointerDown(view(), { pointerId: 1, clientX: 0, clientY: 0, button: 2 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 30, clientY: 0, buttons: 2 });
    expect(seen.camera.yaw).toBe(0);
    expect(seen.camera.target[0]).not.toBe(0);
  });

  it("zooms with Ctrl or Cmd and the wheel, and lets a plain wheel scroll the page", () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    expect(fireEvent.wheel(view(), { deltaY: 100 })).toBe(true);
    expect(seen.camera.distance).toBe(10);
    expect(fireEvent.wheel(view(), { deltaY: 100, ctrlKey: true })).toBe(false);
    expect(seen.camera.distance).toBeGreaterThan(10);
    const after = seen.camera.distance;
    fireEvent.wheel(view(), { deltaY: -100, metaKey: true });
    expect(seen.camera.distance).toBeLessThan(after);
  });

  it("zooms by a two-finger pinch", () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    fireEvent.pointerDown(view(), { pointerId: 1, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerDown(view(), { pointerId: 2, clientX: 100, clientY: 0, button: 0 });
    fireEvent.pointerMove(view(), { pointerId: 2, clientX: 200, clientY: 0, buttons: 1 }); // fingers apart: closer
    expect(seen.camera.distance).toBeLessThan(10);
  });

  it("works from the keyboard: arrows orbit, Shift pans, + and - zoom, 0 resets", async () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    await userEvent.click(view());
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(seen.camera.yaw).toBeGreaterThan(0);
    expect(seen.camera.pitch).toBeLessThan(0);
    await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(seen.camera.target[0]).not.toBe(0);
    await userEvent.keyboard("+");
    expect(seen.camera.distance).toBe(8);
    await userEvent.keyboard("-");
    expect(seen.camera.distance).toBeCloseTo(10);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    await userEvent.keyboard("0");
    expect(seen.camera).toMatchObject({ yaw: 0, pitch: 0, distance: 10, target: [0, 0, 0] });
  });

  it("Reset view goes home, animated unless motion is reduced", async () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} />);
    await userEvent.click(view());
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(seen.camera.yaw).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Reset view" }));
    await act(async () => void (await new Promise((r) => setTimeout(r, 400))));
    expect(seen.camera.yaw).toBeCloseTo(0);
  });
});

describe("fly mode", () => {
  it("walks along the look direction and strafes, one step a press under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    const seen = fresh();
    renderWithStrata(<Host seen={seen} mode="fly" initial={{ distance: 0, yaw: 0, pitch: 0 }} />);
    await userEvent.click(view());
    await userEvent.keyboard("w");
    expect(seen.camera.target[2]).toBeGreaterThan(0);
    await userEvent.keyboard("d");
    expect(seen.camera.target[0]).toBeLessThan(0); // right of a camera looking along +z is -x
    await userEvent.keyboard("e");
    expect(seen.camera.target[1]).toBeGreaterThan(0);
    expect(seen.camera.distance).toBe(0);
  });

  it("keeps walking while a key is held and stops on release", async () => {
    const user = userEvent.setup(); // one instance, so the release finds the key it pressed
    const seen = fresh();
    renderWithStrata(<Host seen={seen} mode="fly" initial={{ distance: 0, yaw: 0, pitch: 0 }} />);
    await user.click(view());
    await user.keyboard("{w>}");
    await act(async () => void (await new Promise((r) => setTimeout(r, 60))));
    expect(seen.camera.target[2]).toBeGreaterThan(0);
    await user.keyboard("{/w}");
    await act(async () => void (await new Promise((r) => setTimeout(r, 40))));
    const stopped = seen.camera.target[2];
    await act(async () => void (await new Promise((r) => setTimeout(r, 60))));
    expect(seen.camera.target[2]).toBe(stopped);
  });

  it("looks by dragging, the picture following the pointer", () => {
    const seen = fresh();
    renderWithStrata(<Host seen={seen} mode="fly" initial={{ distance: 0, yaw: 0, pitch: 0 }} />);
    fireEvent.pointerDown(view(), { pointerId: 1, clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(view(), { pointerId: 1, clientX: 100, clientY: 0, buttons: 1 });
    expect(seen.camera.yaw).toBeLessThan(0);
  });
});
