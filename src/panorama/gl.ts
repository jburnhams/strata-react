import type { PanoramaView } from "./projection";

// The WebGL2 side of `PanoramaViewer` (strata-react issue #178): one full-screen triangle, and a
// fragment shader that does for every pixel what `project`/`unproject` do for one (projection.ts holds
// the same formulas, and tests hold the two to each other): build the ray through the pixel from the
// view's yaw, pitch and field of view, turn it into longitude and latitude, and read the equirectangular
// texture there. The texture repeats across the seam (longitude) and clamps at the poles. No mipmaps:
// the longitude wraps with an `atan`, whose jump at the seam would make a mipmapped lookup draw a line
// one pixel wide down it; plain linear filtering draws none.
//
// Cost, as documented for apps: one texture upload per *drawn video frame* (`texImage2D` of the
// `<video>`), none for a still picture (uploaded once), and a draw only when the view, the size or the
// picture changed, never on a timer.

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vNdc;
void main() { vNdc = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform sampler2D uPicture;
uniform float uYaw;
uniform float uPitch;
uniform float uTanHalf;
uniform float uAspect;
const float PI = 3.14159265358979;
void main() {
  vec3 forward = vec3(cos(uPitch) * sin(uYaw), sin(uPitch), cos(uPitch) * cos(uYaw));
  vec3 right = vec3(cos(uYaw), 0.0, -sin(uYaw));
  vec3 up = vec3(-sin(uPitch) * sin(uYaw), cos(uPitch), -sin(uPitch) * cos(uYaw));
  vec3 ray = normalize(forward + vNdc.x * uTanHalf * right + vNdc.y * (uTanHalf / uAspect) * up);
  float lon = atan(ray.x, ray.z);
  float lat = asin(clamp(ray.y, -1.0, 1.0));
  outColor = texture(uPicture, vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI));
}`;

/** Anything WebGL can take as a texture: a decoded image or a playing video. */
export type PanoramaPicture = HTMLImageElement | HTMLVideoElement | ImageBitmap | HTMLCanvasElement;

/** What draws the window. */
export type PanoramaRenderer = {
  /** Sends the picture to the GPU. Call when the picture is a new one (an image) or a new frame (a video). */
  upload: (picture: PanoramaPicture) => void;
  /** Draws the view into a canvas of `width` by `height` device pixels. */
  draw: (view: PanoramaView, width: number, height: number) => void;
  /** How many times `upload` has sent a picture (a video frame, an image), for the documented cost and for tests. */
  uploads: () => number;
  /** Frees the GPU objects. */
  dispose: () => void;
};

/** Makes a renderer on `canvas`, or null where WebGL2 is not available (the viewer then shows the flat picture). */
export function createRenderer(canvas: HTMLCanvasElement): PanoramaRenderer | null {
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false, alpha: false }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Panorama shader: ${log}`);
    }
    return shader;
  };
  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Panorama program: ${gl.getProgramInfoLog(program)}`);
  } catch {
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // One triangle that covers the screen.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const uniforms = {
    yaw: gl.getUniformLocation(program, "uYaw"),
    pitch: gl.getUniformLocation(program, "uPitch"),
    tanHalf: gl.getUniformLocation(program, "uTanHalf"),
    aspect: gl.getUniformLocation(program, "uAspect"),
    picture: gl.getUniformLocation(program, "uPicture"),
  };
  gl.uniform1i(uniforms.picture, 0);
  let uploaded = 0;
  let has = false;

  return {
    upload(picture) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
      uploaded++;
      has = true;
    },
    draw(view, width, height) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      if (!has) {
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }
      const rad = Math.PI / 180;
      gl.uniform1f(uniforms.yaw, view.yaw * rad);
      gl.uniform1f(uniforms.pitch, view.pitch * rad);
      gl.uniform1f(uniforms.tanHalf, Math.tan((view.fov * rad) / 2));
      gl.uniform1f(uniforms.aspect, width / height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    uploads: () => uploaded,
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
