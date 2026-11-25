import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SceneViewport, useOrbitCamera, type SceneFrame } from "../src/scene";

// Issue #370: a frame for a 3D scene the app draws. The scene here is a coloured cube and a floor grid
// in plain WebGL2 (no library): the point is that the app's `render` is this small, and everything
// around it (pointer, wheel, keys, reset, resize, a lost context, the words) is the viewport's. Resting
// stories are baselines, drawn in Chromium; the ones that move are skipped by the visual suite.

const meta = { title: "Data/SceneViewport", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const VERT = `#version 300 es
in vec3 aPos; in vec3 aColour; uniform mat4 uVP; out vec3 vColour;
void main() { vColour = aColour; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FRAG = `#version 300 es
precision mediump float; in vec3 vColour; out vec4 outColour;
void main() { outColour = vec4(vColour, 1.0); }`;

// A unit cube from 12 triangles (a colour per face), then the grid lines of a floor at y = -1.
function geometry() {
  const faces: [number[][], number[]][] = [
    [[[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [0.78, 0.28, 0.2]],
    [[[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [0.2, 0.42, 0.72]],
    [[[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [0.9, 0.7, 0.2]],
    [[[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [0.35, 0.35, 0.4]],
    [[[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [0.25, 0.6, 0.4]],
    [[[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [0.55, 0.3, 0.6]],
  ];
  const tri: number[] = [];
  for (const [q, c] of faces) for (const i of [0, 1, 2, 0, 2, 3]) tri.push(...q[i]!, ...c);
  const lines: number[] = [];
  for (let i = -6; i <= 6; i++) {
    const c = i === 0 ? [0.7, 0.7, 0.75] : [0.45, 0.47, 0.5];
    lines.push(i, -1, -6, ...c, i, -1, 6, ...c, -6, -1, i, ...c, 6, -1, i, ...c);
  }
  return { tri: new Float32Array(tri), lines: new Float32Array(lines) };
}

function useScene() {
  const resources = React.useRef<{ context: number; program: WebGLProgram; vaos: [WebGLVertexArrayObject, number][]; uVP: WebGLUniformLocation | null } | null>(null);
  const data = React.useMemo(geometry, []);
  return React.useCallback(
    (gl: WebGL2RenderingContext, frame: SceneFrame) => {
      if (!resources.current || resources.current.context !== frame.context) {
        const program = gl.createProgram()!;
        for (const [type, source] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
          const shader = gl.createShader(type)!;
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          gl.attachShader(program, shader);
        }
        gl.linkProgram(program);
        const make = (array: Float32Array): [WebGLVertexArrayObject, number] => {
          const vao = gl.createVertexArray()!;
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
          gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
          for (const [name, offset] of [["aPos", 0], ["aColour", 12]] as const) {
            const at = gl.getAttribLocation(program, name);
            gl.enableVertexAttribArray(at);
            gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 24, offset);
          }
          return [vao, array.length / 6];
        };
        resources.current = { context: frame.context, program, vaos: [make(data.tri), make(data.lines)], uVP: gl.getUniformLocation(program, "uVP") };
      }
      const r = resources.current;
      gl.clearColor(0.12, 0.13, 0.16, 1);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(r.program);
      gl.uniformMatrix4fv(r.uVP, false, frame.viewProjection);
      gl.bindVertexArray(r.vaos[0]![0]);
      gl.drawArrays(gl.TRIANGLES, 0, r.vaos[0]![1]);
      gl.bindVertexArray(r.vaos[1]![0]);
      gl.drawArrays(gl.LINES, 0, r.vaos[1]![1]);
    },
    [data],
  );
}

function Scene({ mode, yaw = 35, pitch = 25, distance = 7, fly }: { mode?: "orbit" | "fly"; yaw?: number; pitch?: number; distance?: number; fly?: boolean }) {
  const { camera, setCamera, home } = useOrbitCamera(fly ? { target: [0, 0.5, -6], distance: 0, yaw: 180, pitch: 0 } : { distance, yaw, pitch }, { minDistance: 1.5, maxDistance: 30 });
  const render = useScene();
  return <SceneViewport label="Cube and floor" className="max-w-3xl" camera={camera} onCameraChange={setCamera} home={home} mode={mode} limits={fly ? { minDistance: 0 } : { minDistance: 1.5, maxDistance: 30 }} render={render} />;
}

/** Orbiting a cube from the front, a quarter up. Drag to orbit, right drag or Shift to pan, Ctrl/Cmd and the wheel (or a pinch) to zoom; arrows, `+` `-` and `0` from the keyboard; a plain wheel scrolls the page. The canvas is named by where it looks. */
export const Orbit: Story = { render: () => <Scene /> };

/** The same scene from the side and above. */
export const FromAbove: Story = { render: () => <Scene yaw={-70} pitch={55} distance={9} /> };

/** A fly camera, for a walkthrough: the eye is the camera. Drag looks, W A S D and the arrows walk, Q and E go down and up, Shift is faster. Interactive. */
export const Fly: Story = { tags: ["no-visual"], render: () => <Scene mode="fly" fly /> };
