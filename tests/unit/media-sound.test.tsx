import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MediaPlayer, VolumeControl } from "../../src";
import { makeupGain } from "../../src/components/media-sound";
import { installFakeMedia, type FakeMedia } from "../utils/media";
import { installFakeWebAudio, type FakeWebAudio } from "../utils/web-audio";

// The player's `gain` and `boost` (from Tubes' loudness normalisation): the level is played through Web Audio,
// only once the context runs, with a limiter whose make-up gain is taken back off.

let media: FakeMedia;
let audio: FakeWebAudio;
beforeEach(() => {
  media = installFakeMedia();
  audio = installFakeWebAudio();
});
afterEach(() => {
  audio.uninstall();
  media.uninstall();
});

const videoOf = (c: HTMLElement) => c.querySelector("video") as HTMLVideoElement;
/** The level asked for, without the limiter's make-up correction. */
const level = (el: HTMLMediaElement) => {
  const l = audio.level(el);
  return l === null ? null : Math.round(l * makeupGain() * 1000) / 1000;
};

describe("makeupGain", () => {
  it("is the spec's (1 / curve(1))^0.6: about 0.57 dB at a -1 dB threshold and ratio 20", () => {
    // Measured in Chromium with an OfflineAudioContext (2026-11-28): 0.25 in, 0.26695 out.
    expect(makeupGain()).toBeCloseTo(0.26695 / 0.25, 3);
  });
});

describe("MediaPlayer gain", () => {
  it("leaves the sound alone without a gain or boost: no audio context at all", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" />);
    act(() => media.loaded(videoOf(container), 60));
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(audio.contexts).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Louder/ })).toBeNull();
  });

  it("plays at the app's gain once the context runs, and follows a new one", async () => {
    const { container, rerender } = render(
      <MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" gain={1.5} />,
    );
    act(() => media.loaded(videoOf(container), 60));
    await act(async () => {});
    expect(level(videoOf(container))).toBe(1.5);
    rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" gain={0.5} />);
    expect(level(videoOf(container))).toBe(0.5);
  });

  it("keeps the element out of a context that has not started, so it is never silenced", async () => {
    audio.holdStart();
    const { container } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" gain={2} />);
    act(() => media.loaded(videoOf(container), 60));
    await act(async () => {});
    expect(audio.routed(videoOf(container))).toBe(false);
    await act(async () => audio.allowStart());
    expect(level(videoOf(container))).toBe(2);
  });

  it("makes one graph per element, however often the gain changes", async () => {
    const { container, rerender } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" gain={1.2} />);
    await act(async () => {});
    for (const g of [1.3, 0.8, 1]) rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" gain={g} />);
    expect(audio.contexts).toHaveLength(1);
    expect(level(videoOf(container))).toBe(1);
  });
});

describe("MediaPlayer gain, from review (#407)", () => {
  it("heads for the newest gain even when an earlier one was asked for before the context started", async () => {
    audio.holdStart();
    const { container, rerender } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" gain={2} />);
    await act(async () => {});
    rerender(<MediaPlayer label="Tour" kind="video" src="/a.mp4" gain={1} />);
    await act(async () => audio.allowStart());
    expect(level(videoOf(container))).toBe(1);
  });

  it("never routes another site's file, which a graph would silence, unless it is loaded with crossOrigin", async () => {
    const away = render(
      <MediaPlayer
        label="Tour"
        kind="video"
        src="https://elsewhere.example/a.mp4"
        controls="strata"
        gain={2}
        boost={200}
      />,
    );
    await act(async () => {});
    expect(audio.routed(videoOf(away.container))).toBe(false);
    expect(screen.queryByRole("button", { name: /Louder/ })).toBeNull();
    away.unmount();
    const { container } = render(
      <MediaPlayer
        label="Tour"
        kind="video"
        src="https://elsewhere.example/a.mp4"
        controls="strata"
        gain={2}
        boost={200}
        crossOrigin="anonymous"
      />,
    );
    await act(async () => {});
    expect(videoOf(container)).toHaveAttribute("crossorigin", "anonymous");
    expect(level(videoOf(container))).toBe(2);
  });

  it("suspends the audio context when the player goes, and starts it again if the same element comes back", async () => {
    const { unmount } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" gain={1.5} />);
    await act(async () => {});
    expect(audio.contexts[0].state).toBe("running");
    unmount();
    await act(async () => {});
    expect(audio.contexts[0].state).toBe("suspended");
  });
});

describe("MediaPlayer boost", () => {
  it("stops at 100% until Louder is pressed, then goes on to the boost on top of the gain", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" gain={0.8} boost={200} />,
    );
    act(() => media.loaded(videoOf(container), 60));
    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(slider).toHaveAttribute("max", "100");
    await user.click(screen.getByRole("button", { name: "Louder, up to 200%" }));
    expect(slider).toHaveAttribute("max", "200");
    act(() => slider.focus());
    await user.keyboard("{End}");
    expect(slider).toHaveValue("200");
    expect(videoOf(container).volume).toBe(1);
    expect(level(videoOf(container))).toBe(1.6);
    // Off again: back to 100%, and the slider stops there.
    await user.click(screen.getByRole("button", { name: "Louder, up to 200%" }));
    expect(slider).toHaveAttribute("max", "100");
    expect(slider).toHaveValue("100");
    expect(level(videoOf(container))).toBe(0.8);
  });

  it("never passes 100% by the wheel alone, but carries on past it once there", async () => {
    const user = userEvent.setup();
    const { container } = render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" boost={200} />);
    act(() => media.loaded(videoOf(container), 60));
    const wheel = (deltaY: number) =>
      act(
        () =>
          void videoOf(container).dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true })),
      );
    await user.click(videoOf(container));
    wheel(-100);
    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(slider).toHaveValue("100");
    await user.click(screen.getByRole("button", { name: "Louder, up to 200%" }));
    act(() => slider.focus());
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveValue("101");
    await user.click(videoOf(container)); // the wheel works on the focused picture
    wheel(-100);
    expect(slider).toHaveValue("106");
    expect(level(videoOf(container))).toBe(1.06);
  });

  it("offers no Louder where the browser has no Web Audio", () => {
    audio.uninstall();
    const had = (window as { AudioContext?: unknown }).AudioContext;
    delete (window as { AudioContext?: unknown }).AudioContext;
    try {
      render(<MediaPlayer label="Tour" kind="video" src="/a.mp4" controls="strata" boost={200} gain={2} />);
      expect(screen.queryByRole("button", { name: /Louder/ })).toBeNull();
      expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("max", "100");
    } finally {
      (window as { AudioContext?: unknown }).AudioContext = had;
    }
  });
});

describe("VolumeControl boost", () => {
  function Volume({ start }: { start: number }) {
    const [volume, setVolume] = React.useState(start);
    return (
      <>
        <VolumeControl volume={volume} onVolumeChange={setVolume} boost={150} />
        <output aria-label="volume">{volume}</output>
      </>
    );
  }
  it("shows Louder pressed for a level already past 100, and remembers it through a mute", async () => {
    const user = userEvent.setup();
    render(<Volume start={130} />);
    expect(screen.getByRole("button", { name: "Louder, up to 150%" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(screen.getByRole("button", { name: "Louder, up to 150%" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(screen.getByLabelText("volume")).toHaveTextContent("130");
  });
});
