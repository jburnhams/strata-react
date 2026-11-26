import { describe, expect, it } from "vite-plus/test";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoxList, BoxedPicture, Thumbnail, regionStyle, useBoxes, type PictureBox } from "../../src";
import { renderWithStrata } from "../../src/testing";

// strata-models' face store: a face shown on its own from its photo (`Thumbnail region`), and the
// photo opened on one face (`BoxedPicture`). The layout shims give every element a 640×280 box.

const faces: PictureBox[] = [
  { id: "f1", x: 100, y: 80, w: 60, h: 80, label: "Face 1: Ada, confirmed", tone: "success" },
  { id: "f2", x: 600, y: 100, w: 50, h: 60, label: "Face 2: not named" },
];
const of = { w: 800, h: 600 };

describe("regionStyle", () => {
  it("puts the picture so the padded box fills a square frame, centred and never squashed", () => {
    // 80 tall × 1.6 = 128; widened to a square: 128 × 128 about the centre (130, 120), so the crop starts at (66, 56).
    expect(regionStyle({ of, box: faces[0]! }, 1)).toEqual({
      left: "-51.5625%",
      top: "-43.75%",
      width: "625%",
      height: "468.75%",
    });
  });

  it("widens to the frame's shape and takes pad", () => {
    const s = regionStyle({ of, box: { x: 0, y: 0, w: 100, h: 100 }, pad: 1 }, 2); // 200 × 100 about (50, 50)
    expect(s).toEqual({ left: "25%", top: "0%", width: "400%", height: "600%" });
  });
});

describe("Thumbnail region", () => {
  it("places the whole picture so the box fills the thumbnail, instead of fitting it", () => {
    const { container } = renderWithStrata(
      <Thumbnail src="/p.jpg" alt="Ada" missing="Photo not kept" region={{ of, box: faces[0]! }} eager />,
    );
    const img = container.querySelector("img")!;
    expect(img.style.left).toBe("-51.5625%");
    expect(img.style.width).toBe("625%");
    expect(img).toHaveClass("max-w-none");
    expect(img).not.toHaveClass("object-cover");
  });
});

function Photo({ zoom, chosen = "f1" }: { zoom?: boolean; chosen?: string | null }) {
  const state = useBoxes(chosen);
  return (
    <div>
      <BoxedPicture
        label="Photo 12"
        src="/p.jpg"
        alt=""
        missing="Photo not kept"
        of={of}
        boxes={faces}
        state={state}
        boxesLabel="Faces in this photo"
        zoom={zoom}
      />
      <BoxList label="Faces" boxes={faces} state={state} />
    </div>
  );
}

const transformOf = (frame: HTMLElement) => (frame.querySelector("[style*=transform]") as HTMLElement).style.transform;

describe("BoxedPicture", () => {
  it("opens zoomed to the chosen face, with every face a named box", () => {
    renderWithStrata(<Photo />);
    const frame = screen.getByRole("group", { name: "Photo 12" });
    expect(within(frame).getByRole("group", { name: "Faces in this photo" })).toBeInTheDocument();
    expect(within(frame).getByRole("button", { name: "Face 1: Ada, confirmed" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(transformOf(frame)).toMatch(/scale\((?!1\))/);
    expect(within(frame).getByRole("button", { name: "Face 1: Ada, confirmed" })).toHaveAttribute("fill", "none"); // an outline, not a veil over the face
  });

  it("zooms to a face chosen in the list beside it", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Photo chosen={null} />);
    const frame = screen.getByRole("group", { name: "Photo 12" });
    const before = transformOf(frame);
    await user.click(screen.getByRole("option", { name: "Face 2: not named" }));
    expect(transformOf(frame)).not.toBe(before);
    expect(within(frame).getByRole("button", { name: "Face 2: not named" })).toHaveAttribute("aria-pressed", "true");
  });

  it("stays fitted with zoom off, and goes back to fitted when zoom is turned off", () => {
    const { rerender } = renderWithStrata(<Photo />);
    const frame = screen.getByRole("group", { name: "Photo 12" });
    expect(transformOf(frame)).not.toBe("translate(0px) scale(1)");
    rerender(<Photo zoom={false} />);
    expect(transformOf(frame)).toBe("translate(0px) scale(1)");
  });

  it("zooms again when the frame changes size, so the face stays in the middle", () => {
    // The browser's part: a ResizeObserver that this test fires after giving the frame a new size.
    const Shim = globalThis.ResizeObserver;
    const rect = Element.prototype.getBoundingClientRect;
    let fire = () => {};
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        fire = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      renderWithStrata(<Photo />);
      const frame = screen.getByRole("group", { name: "Photo 12" });
      const before = transformOf(frame);
      Element.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 320,
        bottom: 140,
        width: 320,
        height: 140,
        toJSON: () => ({}),
      });
      act(() => fire());
      expect(transformOf(frame)).not.toBe(before);
    } finally {
      globalThis.ResizeObserver = Shim;
      Element.prototype.getBoundingClientRect = rect;
    }
  });

  it("says in the product's words when the photo is not there, and still shows the faces", () => {
    function NoPhoto() {
      const state = useBoxes();
      return (
        <BoxedPicture
          label="Photo 12"
          src={null}
          alt="Photo 12"
          missing="Photo not kept"
          of={of}
          boxes={faces}
          state={state}
          boxesLabel="Faces in this photo"
        />
      );
    }
    renderWithStrata(<NoPhoto />);
    expect(screen.getByRole("img", { name: "Photo 12: Photo not kept" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Face / })).toHaveLength(2);
  });
});
