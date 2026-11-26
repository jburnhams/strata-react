// The scene entry: `import { SceneViewport } from "strata-react/scene"`. Its own entry, so an app that draws
// no 3D ships no camera code. It has no dependency of its own: the context is the browser's WebGL2.
export {
  SceneViewport,
  useOrbitCamera,
  type SceneViewportProps,
  type SceneViewportHandle,
  type OrbitCameraState,
} from "./scene-viewport";
export {
  basis,
  clampCamera,
  describeCamera,
  dolly,
  frameFor,
  lookAlong,
  multiply,
  pan,
  perspective,
  turn,
  walk,
  cameraFromView,
  followCamera,
  viewFromCamera,
  DEFAULT_LIMITS,
  type CameraLimits,
  type LookView,
  type OrbitCamera,
  type SceneFrame,
} from "./camera";
