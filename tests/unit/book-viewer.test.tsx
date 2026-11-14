import { beforeEach, describe, expect, it } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { BookViewer, Status, findPage, sayPosition, useBookUrl, viewOf, viewsOf, type BookPage } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #238: a scanned book read page by page or as spreads.

const printed = ["", "", "i", "ii", "iii", "iv", "1", "2", "3", "4"];
const pages: BookPage[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, src: `/scan/${i + 1}.jpg`, label: `Scan ${i + 1}`, scan: String(i + 1), printed: printed[i] || undefined, natural: [1200, 1800] }));

describe("page arithmetic", () => {
  it("opens on the first page alone on the right, then pairs 2 and 3, 4 and 5", () => {
    expect(viewsOf(5, true)).toEqual([[0], [1, 2], [3, 4]]);
    expect(viewsOf(4, true)).toEqual([[0], [1, 2], [3]]);
    expect(viewsOf(3, false)).toEqual([[0], [1], [2]]);
    expect([0, 1, 2, 3, 4].map((i) => viewOf(i, true))).toEqual([0, 1, 1, 2, 2]);
  });
  it("finds a printed label first, then the scan's position, ignoring case and a leading 'page'", () => {
    expect(findPage(pages, "iv")).toBe(5);
    expect(findPage(pages, "IV")).toBe(5);
    expect(findPage(pages, "page 2")).toBe(7); // printed 2 beats the scan's second image
    expect(findPage(pages, "5")).toBe(4); // nothing printed 5: the scan's fifth
    expect(findPage(pages, "zz")).toBeNull();
  });
  it("says where it is in words", () => {
    expect(sayPosition([pages[6]], 10)).toBe("Page 7 (1) of 10");
    expect(sayPosition([pages[1], pages[2]], 10)).toBe("Pages 2 and 3 (i) of 10");
    expect(sayPosition([pages[0]], 10)).toBe("Page 1 of 10");
  });
});

const Where = () => <p aria-label="Search">{useLocation().search}</p>;
function Book({ layout }: { layout?: "single" | "spread" }) {
  const url = useBookUrl(pages.length);
  return (
    <>
      <Where />
      <BookViewer label="Punch book" pages={pages} {...url} missing="This page could not be loaded." layout={layout} badge={(p) => (p.id === "p4" ? <Status tone="warning">Look</Status> : null)} side={(shown) => <p>Text of {shown.map((p) => p.scan).join(" and ")}</p>} sideLabel="Transcript" />
    </>
  );
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

describe("BookViewer", () => {
  it("opens on page 1 alone on the right, said in words, with the transcript beside it", () => {
    renderWithStrata(<Book />);
    expect(screen.getByRole("region", { name: "Punch book" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Scan 1" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Scan 2" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 10");
    expect(screen.getByRole("complementary", { name: "Transcript" })).toHaveTextContent("Text of 1");
    expect(screen.getByRole("button", { name: "Previous pages" })).toBeDisabled();
  });

  it("turns spread by spread with the buttons and the keys, and keeps the scan position in the URL", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Book />);
    await user.click(screen.getByRole("button", { name: "Next pages" }));
    expect(screen.getByRole("group", { name: "Scan 2" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Scan 3" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Pages 2 and 3 (i) of 10");
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=2");
    screen.getByRole("group", { name: "Scan 2" }).focus();
    await user.keyboard("{PageDown}");
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=4");
    await user.keyboard("{End}");
    expect(screen.getByRole("status")).toHaveTextContent("Page 10 (4) of 10");
    await user.keyboard("{Home}");
    expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 10");
    await user.keyboard("{ArrowRight}{ArrowLeft}");
    expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 10");
  });

  it("opens on a pasted link", () => {
    renderWithStrata(<Book />, { route: "/book?page=6" });
    expect(screen.getByRole("status")).toHaveTextContent("Pages 6 (iv) and 7 (1) of 10");
  });

  it("goes to a printed label or a scan number, and says when nothing has that name", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Book />);
    const box = screen.getByRole("textbox", { name: "Go to page" });
    await user.type(box, "iv{Enter}");
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=6");
    await user.type(box, "9{Enter}");
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=9");
    await user.type(box, "xx{Enter}");
    expect(await screen.findByText(/No page is called “xx”/)).toBeInTheDocument();
    expect(box).toHaveAccessibleDescription(/No page is called/);
  });

  it("shows one page at a time as a single layout, stepping by one", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Book layout="single" />, { route: "/book?page=3" });
    expect(screen.getByRole("group", { name: "Scan 3" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Scan 2" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=4");
  });

  it("has a thumbnail strip with the pages' names and a badge on the one that needs a look", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Book />);
    const strip = screen.getByRole("listbox", { name: "Pages in this book" });
    expect(within(strip).getAllByRole("option")).toHaveLength(10);
    expect(within(strip).getByText("Look")).toBeInTheDocument();
    await user.click(within(strip).getByRole("option", { name: /Page 6 \(iv\)/ }));
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=6");
  });

  it("turns a page with a click on its outer half", async () => {
    renderWithStrata(<Book />, { route: "/book?page=2" });
    const right = screen.getByRole("group", { name: "Scan 3" });
    right.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const down = { pointerId: 1, button: 0, clientX: 180, clientY: 100 };
    await act(async () => {
      right.dispatchEvent(new PointerEvent("pointerdown", { ...down, bubbles: true }));
      right.dispatchEvent(new PointerEvent("pointerup", { ...down, bubbles: true }));
      await new Promise((r) => setTimeout(r, 350));
    });
    expect(screen.getByLabelText("Search")).toHaveTextContent("?page=4");
  });
});
