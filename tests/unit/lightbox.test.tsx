import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import userEvent from "@testing-library/user-event";
import { Button, Lightbox, PropertyList, useLightboxUrl, type LightboxItem } from "../../src";
import { renderWithStrata } from "../../src/testing";

const items: LightboxItem[] = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, src: `/pic/${i}.jpg`, label: `Bowl ${i + 1}`, natural: [3000, 2000] as const }));

function Harness({ onCompare, ticked = [], start = 0 }: { onCompare?: (ids: readonly string[]) => void; ticked?: string[]; start?: number }) {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(start);
  return (
    <>
      <button onClick={() => { setIndex(start); setOpen(true); }}>Open Bowl 1</button>
      <Lightbox
        title="Photos of firing f-0412"
        items={items}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
        missing="This photo could not be loaded."
        details={(item) => <PropertyList label="Photo details" items={[{ term: "Name", value: item.label }]} />}
        ticked={ticked}
        onCompare={onCompare}
      />
    </>
  );
}

const loaded: string[] = [];
const realSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
beforeEach(() => {
  loaded.length = 0;
  // jsdom never loads a picture; this records which addresses are given to an image, so the test sees what is requested ahead.
  Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true, get: realSrc.get, set(v: string) { loaded.push(v); realSrc.set!.call(this, v); } });
});
afterEach(() => { Object.defineProperty(HTMLImageElement.prototype, "src", realSrc); });

describe("Lightbox", () => {
  it("opens as a titled dialog on the first picture, and says where it is", async () => {
    renderWithStrata(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    expect(screen.getByRole("dialog", { name: "Photos of firing f-0412" })).toBeInTheDocument();
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bowl 1" })).toHaveAttribute("src", "/pic/0.jpg");
    expect(screen.getByRole("button", { name: "Previous picture" })).toBeDisabled();
  });

  it("steps with the buttons and with arrow keys, Home and End, stopping at the ends", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    await user.click(screen.getByRole("button", { name: "Next picture" }));
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByText("4 of 5")).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByText("5 of 5")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("5 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next picture" })).toBeDisabled();
    await user.keyboard("{Home}");
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
  });

  it("returns focus to the tile that opened it on Escape", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    const tile = screen.getByRole("button", { name: "Open Bowl 1" });
    await user.click(tile);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(tile).toHaveFocus());
  });

  it("requests the neighbours ahead of being asked for", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness start={2} />);
    await user.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    expect(loaded).toEqual(expect.arrayContaining(["/pic/1.jpg", "/pic/3.jpg"]));
    await user.keyboard("{ArrowRight}");
    expect(loaded).toContain("/pic/4.jpg");
  });

  it("shows the app's words for a picture that fails, and the next one still works", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    fireEvent.error(screen.getByRole("img", { name: "Bowl 1" }));
    expect(screen.getByText("This photo could not be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bowl 1" }).tagName).not.toBe("IMG");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("img", { name: "Bowl 2" }).tagName).toBe("IMG");
  });

  it("shows details beside the picture and follows the picture", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    expect(screen.getByRole("complementary", { name: "Details" })).toHaveTextContent("Bowl 1");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("complementary", { name: "Details" })).toHaveTextContent("Bowl 2");
  });

  it("hands the ticked ids to the app, needing two", async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    const { rerender } = renderWithStrata(<Harness ticked={["p1"]} onCompare={onCompare} />);
    await user.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    expect(screen.getByRole("button", { name: "Compare ticked (1)" })).toBeDisabled();
    rerender(<Harness ticked={["p1", "p3"]} onCompare={onCompare} />);
    await user.click(screen.getByRole("button", { name: "Compare ticked (2)" }));
    expect(onCompare).toHaveBeenCalledWith(["p1", "p3"]);
  });

  it("leaves the arrow keys to the zoom toolbar", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open Bowl 1" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    screen.getByRole("button", { name: "Zoom in" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });
});

describe("Lightbox for a book (issue #239)", () => {
  const book: LightboxItem[] = items.map((it, i) => ({ ...it, position: `Page ${i + 20} (${i + 10})` }));
  function Url() {
    const url = useLightboxUrl(book);
    const location = useLocation();
    return (
      <>
        <output aria-label="Search">{location.search}</output>
        <button onClick={() => url.show("p2")}>Open page 3</button>
        <Lightbox
          title="Pages"
          items={book}
          index={url.index}
          onIndexChange={url.onIndexChange}
          open={url.open}
          onOpenChange={url.onOpenChange}
          missing="This page could not be loaded."
          strip
          overlay={(item, natural) => <i data-testid="layer">{`${item.id} ${natural ? natural.join("x") : "?"}`}</i>}
          actions={(item) => <Button size="sm">Edit {item.label}</Button>}
        />
      </>
    );
  }

  it("opens from ?view=, names the position with both numbers, draws the layer and the item's action", async () => {
    renderWithStrata(<Url />, { route: "/book?view=p1" });
    expect(await screen.findByRole("dialog", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByText("Page 21 (11) of 5")).toBeInTheDocument();
    expect(screen.getByTestId("layer")).toHaveTextContent("p1 3000x2000");
    expect(screen.getByRole("button", { name: "Edit Bowl 2" })).toBeInTheDocument();
  });

  it("keeps the open item in the URL: stepping replaces it and closing removes it", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Url />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open page 3" }));
    expect(screen.getByLabelText("Search")).toHaveTextContent("?view=p2");
    await user.click(screen.getByRole("button", { name: "Next picture" }));
    expect(screen.getByLabelText("Search")).toHaveTextContent("?view=p3");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByLabelText("Search")).toBeEmptyDOMElement());
  });

  it("treats an id that is not in the set as closed", () => {
    renderWithStrata(<Url />, { route: "/book?view=nope" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has a thumbnail strip that jumps and follows the current picture", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Url />, { route: "/book?view=p0" });
    const strip = await screen.findByRole("listbox", { name: "Pictures in this set" });
    expect(strip.querySelectorAll("[role=option]")).toHaveLength(5);
    await user.click(within(strip).getByRole("option", { name: "Page 23 (13), Bowl 4" }));
    expect(screen.getByLabelText("Search")).toHaveTextContent("?view=p3");
    expect(within(strip).getByRole("option", { name: "Page 23 (13), Bowl 4" })).toHaveAttribute("aria-selected", "true");
  });
});
