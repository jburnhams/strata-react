import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Thumbnail, ThumbnailSkeleton } from "../../src";
import { installFakeIntersectionObserver } from "../../src/testing";

// jsdom never fetches images, so the test plays the browser's part: it says when the box scrolls
// near (the fake IntersectionObserver) and whether the image loaded or failed (load/error events).

const photo = "/api/photos/p-301.svg";
const imgIn = (box: HTMLElement) => box.querySelector("img");

describe("Thumbnail", () => {
  let io: ReturnType<typeof installFakeIntersectionObserver>;
  beforeEach(() => {
    io = installFakeIntersectionObserver();
  });
  afterEach(() => io.uninstall());

  it("holds its shape with a skeleton and asks for the image only when it nears the screen", () => {
    const { container } = render(<Thumbnail src={photo} alt="Celadon bowl" missing="Photo not found" aspect="4/3" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.aspectRatio).toBe("4 / 3");
    expect(box).toHaveAttribute("aria-busy", "true");
    expect(imgIn(box)).toBeNull();
    expect(io.observers.at(-1)?.options.rootMargin).toBe("200px");

    io.intersect(box);
    const img = screen.getByRole("img", { name: "Celadon bowl" });
    expect(img).toHaveAttribute("src", photo);
    expect(box).toHaveAttribute("aria-busy", "true");

    fireEvent.load(img);
    expect(box).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("img", { name: "Celadon bowl" })).toBe(img);
    // Once asked for, it stays: scrolling away does not unload it or watch any more.
    io.intersect(box, false);
    expect(imgIn(box)).toBe(img);
    expect(io.observers.every((o) => o.targets.size === 0)).toBe(true);
  });

  it("says which photo is missing, in the product's words, when the image fails", () => {
    const { container } = render(<Thumbnail src="/api/photos/gone.svg" alt="Copper red bottle" missing="Photo not found" />);
    io.intersect(container.firstElementChild!);
    fireEvent.error(screen.getByRole("img", { name: "Copper red bottle" }));
    expect(screen.getByRole("img", { name: "Copper red bottle: Photo not found" })).toHaveTextContent("Photo not found");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the missing words without a request when there is no photo", () => {
    const { container } = render(<Thumbnail src={null} alt="" missing="No photo yet" />);
    expect(screen.getByRole("img", { name: "No photo yet" })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(io.observers.every((o) => o.targets.size === 0)).toBe(true);
  });

  it("starts again for a new src, and an earlier failure does not carry over", () => {
    const { container, rerender } = render(<Thumbnail src="/api/photos/gone.svg" alt="Shino jar" missing="Photo not found" />);
    const box = container.firstElementChild as HTMLElement;
    io.intersect(box);
    fireEvent.error(screen.getByRole("img", { name: "Shino jar" }));
    expect(screen.getByRole("img", { name: "Shino jar: Photo not found" })).toBeInTheDocument();

    rerender(<Thumbnail src={photo} alt="Shino jar" missing="Photo not found" />);
    expect(box).toHaveAttribute("aria-busy", "true");
    fireEvent.load(screen.getByRole("img", { name: "Shino jar" }));
    expect(box).not.toHaveAttribute("aria-busy");
  });

  it("starts again when only srcSet changes after a failure", () => {
    const { rerender } = render(<Thumbnail src={photo} srcSet="/api/photos/gone-2x.svg 2x" alt="Tenmoku tea bowl" missing="Photo not found" eager />);
    fireEvent.error(screen.getByRole("img", { name: "Tenmoku tea bowl" }));
    expect(screen.getByRole("img", { name: "Tenmoku tea bowl: Photo not found" })).toBeInTheDocument();
    rerender(<Thumbnail src={photo} srcSet="/api/photos/p-302-2x.svg 2x" alt="Tenmoku tea bowl" missing="Photo not found" eager />);
    expect(screen.getByRole("img", { name: "Tenmoku tea bowl" })).toHaveAttribute("srcset", "/api/photos/p-302-2x.svg 2x");
  });

  it("loads at once with eager, without an observer", () => {
    const before = io.observers.length;
    render(<Thumbnail src={photo} alt="Celadon bowl" missing="Photo not found" eager />);
    expect(screen.getByRole("img", { name: "Celadon bowl" })).toHaveAttribute("src", photo);
    expect(io.observers.length).toBe(before);
  });

  it("crops by default and fits with fit=contain", () => {
    const { rerender } = render(<Thumbnail src={photo} alt="Cobalt vase" missing="Photo not found" eager />);
    expect(screen.getByRole("img")).toHaveClass("object-cover");
    rerender(<Thumbnail src={photo} alt="Cobalt vase" missing="Photo not found" eager fit="contain" />);
    expect(screen.getByRole("img")).toHaveClass("object-contain");
  });
});

describe("Thumbnail without IntersectionObserver", () => {
  it("loads at once rather than never", () => {
    expect(typeof IntersectionObserver).toBe("undefined");
    render(<Thumbnail src={photo} alt="Celadon bowl" missing="Photo not found" />);
    expect(screen.getByRole("img", { name: "Celadon bowl" })).toHaveAttribute("src", photo);
  });
});

describe("ThumbnailSkeleton", () => {
  it("is the same box, hidden from assistive technology", () => {
    const { container } = render(<ThumbnailSkeleton aspect={1.5} className="w-16" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.aspectRatio).toBe("1.5 / 1");
    expect(box).toHaveAttribute("aria-hidden");
    expect(box).toHaveClass("w-16");
  });
});

describe("Thumbnail with sources to try, a way to reject a picture, and a word when it is gone (issue #209)", () => {
  let io: ReturnType<typeof installFakeIntersectionObserver>;
  beforeEach(() => {
    io = installFakeIntersectionObserver();
  });
  afterEach(() => io.uninstall());
  const sizes = ["/maxres.jpg", "/hq.jpg"];

  it("tries the next source when one fails, and shows the missing words after the last", () => {
    const onMissing = vi.fn();
    const { container } = render(<Thumbnail src={sizes} alt="Kiln cam" missing="No picture" eager onMissing={onMissing} />);
    expect(imgIn(container)).toHaveAttribute("src", "/maxres.jpg");
    fireEvent.error(imgIn(container)!);
    expect(imgIn(container)).toHaveAttribute("src", "/hq.jpg");
    expect(onMissing).not.toHaveBeenCalled();
    fireEvent.error(imgIn(container)!);
    expect(imgIn(container)).toBeNull();
    expect(screen.getByRole("img", { name: "Kiln cam: No picture" })).toBeInTheDocument();
    expect(onMissing).toHaveBeenCalledTimes(1);
  });

  it("does not put the first source's srcSet on a fallback", () => {
    const { container } = render(<Thumbnail src={sizes} srcSet="/maxres-2x.jpg 2x" alt="Kiln cam" missing="No picture" eager />);
    expect(imgIn(container)).toHaveAttribute("srcset", "/maxres-2x.jpg 2x");
    fireEvent.error(imgIn(container)!);
    expect(imgIn(container)).toHaveAttribute("src", "/hq.jpg");
    expect(imgIn(container)).not.toHaveAttribute("srcset");
  });

  it("tells again when the same request fails again after another one loaded", () => {
    const onMissing = vi.fn();
    const ui = (src: string) => <Thumbnail src={src} alt="Kiln cam" missing="No picture" eager onMissing={onMissing} />;
    const { container, rerender } = render(ui("/a.jpg"));
    fireEvent.error(imgIn(container)!);
    expect(onMissing).toHaveBeenCalledTimes(1);
    rerender(ui("/b.jpg"));
    fireEvent.load(imgIn(container)!);
    rerender(ui("/a.jpg"));
    fireEvent.error(imgIn(container)!);
    expect(onMissing).toHaveBeenCalledTimes(2);
  });

  it("stops at the first source that loads", () => {
    const { container } = render(<Thumbnail src={sizes} alt="Kiln cam" missing="No picture" eager />);
    fireEvent.load(imgIn(container)!);
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
    expect(imgIn(container)).toHaveAttribute("src", "/maxres.jpg");
  });

  it("lets the app reject a picture that loaded, such as a host's grey placeholder, and goes on to the next", () => {
    const seen: [string | null, number][] = [];
    const reject = (img: HTMLImageElement, index: number) => {
      seen.push([img.getAttribute("src"), index]);
      return index === 0 ? false : undefined;
    };
    const { container } = render(<Thumbnail src={sizes} alt="Kiln cam" missing="No picture" eager onLoad={reject} />);
    fireEvent.load(imgIn(container)!);
    expect(imgIn(container)).toHaveAttribute("src", "/hq.jpg");
    fireEvent.load(imgIn(container)!);
    expect(seen).toEqual([["/maxres.jpg", 0], ["/hq.jpg", 1]]);
    expect(container.firstElementChild).not.toHaveAttribute("aria-busy");
  });

  it("is missing, and says so once, when the only source is rejected", () => {
    const onMissing = vi.fn();
    const { container } = render(<Thumbnail src="/grey.jpg" alt="Kiln cam" missing="No picture" eager onLoad={() => false} onMissing={onMissing} />);
    fireEvent.load(imgIn(container)!);
    expect(screen.getByRole("img", { name: "Kiln cam: No picture" })).toBeInTheDocument();
    expect(onMissing).toHaveBeenCalledTimes(1);
  });

  it("does not call onMissing for a record with no picture at all", () => {
    const onMissing = vi.fn();
    const { rerender } = render(<Thumbnail src={null} alt="Kiln cam" missing="No picture" onMissing={onMissing} />);
    rerender(<Thumbnail src={[]} alt="Kiln cam" missing="No picture" onMissing={onMissing} />);
    expect(screen.getByRole("img", { name: "Kiln cam: No picture" })).toBeInTheDocument();
    expect(onMissing).not.toHaveBeenCalled();
  });

  it("starts the list again for a new item", () => {
    const { container, rerender } = render(<Thumbnail src={sizes} alt="Kiln cam" missing="No picture" eager />);
    fireEvent.error(imgIn(container)!);
    fireEvent.error(imgIn(container)!);
    rerender(<Thumbnail src={["/other.jpg"]} alt="Kiln cam" missing="No picture" eager />);
    expect(imgIn(container)).toHaveAttribute("src", "/other.jpg");
  });

  it("draws the missing state of a decorative avatar as presentation, not an unnamed image", () => {
    const { container } = render(<Thumbnail src="/gone.jpg" alt="" fallback={<span>N</span>} eager />);
    fireEvent.error(imgIn(container)!);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("N");
    expect(container.querySelector("[role='img']")).toBeNull();
  });
});
