import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
