import { describe, expect, it } from "vite-plus/test";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ScheduleTable, SystemPanel, useSystemInfo, type SystemInfoLike } from "../../src";
import { renderWithStrata } from "../../src/testing";
import { schedule, systemInfo, systemInfoPlain, systemNow } from "../../stories/fixtures/system";
import { server } from "../utils/server";

// The shared status screens: strata-python's `GET /api/system` drawn by one panel (issue #343), and
// a machine's scheduled jobs by one table (issue #344).

const ready = (data: SystemInfoLike) => ({ status: "ready" as const, data });

describe("SystemPanel", () => {
  it("draws the server's facts, each folder as a meter with its state in words, and each service as Up or Down", () => {
    renderWithStrata(<SystemPanel load={ready(systemInfo)} now={systemNow} />);
    const facts = screen.getByRole("heading", { name: "Server" }).closest("section")!;
    expect(within(facts).getByText("1.8.2")).toBeInTheDocument();
    expect(within(facts).getByText("9f3c1ab07d42")).toHaveAttribute("title", systemInfo.commit);
    expect(within(facts).getByText(/up 1d\s1h\s0m/)).toBeInTheDocument();

    // 301.6 of 512 GB free: 41% used, no state. 18 of 466 GB free: 96% used, past "Nearly full".
    const home = screen.getByRole("meter", { name: "home folder disk space used" });
    expect(home).toHaveAttribute("aria-valuetext", "41% used");
    const photos = screen.getByRole("meter", { name: "photos folder disk space used" });
    expect(photos).toHaveAccessibleDescription(/Nearly full/);
    expect(
      screen.getByRole("meter", { name: "archive folder disk space used" }),
    ).toHaveAccessibleDescription(/Nearly full/);

    // A folder that does not exist is a word, not a meter.
    expect(screen.queryByRole("meter", { name: /scratch/ })).toBeNull();
    expect(screen.getByText("Missing")).toBeInTheDocument();

    const services = screen.getByRole("list");
    const [up, down] = within(services).getAllByRole("listitem");
    expect(up).toHaveTextContent("Glaze libraryUpversion 0.9.4");
    expect(down).toHaveTextContent("Photo storeDownConnection refused after 3 s");
  });

  it("says an installed package has no commit, says when a disk could not be read, and draws the app's own facts", () => {
    const unread = {
      ...systemInfoPlain,
      folders: [{ name: "home", path: "/h", exists: true, free_bytes: null, total_bytes: null }],
    };
    renderWithStrata(
      <SystemPanel
        load={ready(unread)}
        facts={[{ term: "Pieces kept", value: "1,284" }]}
        now={systemNow}
      />,
    );
    expect(screen.getByText("Installed package")).toBeInTheDocument();
    expect(screen.getByText("Not measured")).toBeInTheDocument();
    expect(screen.getByText("Pieces kept")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Services" })).toBeNull();
  });

  it("shows a skeleton while loading and the server's words on failure", () => {
    const { container, unmount } = renderWithStrata(<SystemPanel load={{ status: "loading" }} />);
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    unmount();
    renderWithStrata(
      <SystemPanel
        load={{
          status: "error",
          message: "The server could not answer (503).",
          retry: () => undefined,
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The server could not answer (503).");
  });

  it("nests its headings one level down under a page's own h2 (headingLevel)", () => {
    renderWithStrata(
      <section aria-labelledby="about">
        <h2 id="about">About this server</h2>
        <SystemPanel load={ready(systemInfo)} now={systemNow} headingLevel={3} />
      </section>,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "About this server",
    ]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Server",
      "Folders",
      "Services",
    ]);
  });

  it("reads the route through useSystemInfo", async () => {
    server.use(http.get("/api/system", () => HttpResponse.json(systemInfoPlain)));
    function Page() {
      return <SystemPanel load={useSystemInfo()} now={systemNow} />;
    }
    renderWithStrata(<Page />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Server" })).toBeInTheDocument(),
    );
    expect(screen.getByText("1.8.2")).toBeInTheDocument();
  });
});

describe("ScheduleTable", () => {
  it("says each job's last result as a word, with when it last ran and when it runs next", () => {
    renderWithStrata(<ScheduleTable caption="Scheduled jobs" rows={schedule} now={systemNow} />);
    const rows = within(screen.getByRole("grid", { name: "Scheduled jobs" }))
      .getAllByRole("row")
      .slice(1);
    const text = rows.map((r) => r.textContent);
    expect(text[0]).toContain("Nightly backup");
    expect(text[0]).toContain("OK");
    expect(text[0]).toContain("8 hours ago");
    expect(text[0]).toContain("in 16 hours");
    expect(text[1]).toContain("Running"); // running now, whatever the last result was
    expect(text[2]).toContain("Failed");
    expect(text[3]).toContain("Never run");
    expect(text[3]).toContain("Never"); // no last run
    expect(text[4]).toContain("skipped"); // a word the table does not know, shown as it is
  });

  it("hides the last-run and next-run columns on a phone, header and cells together", () => {
    renderWithStrata(<ScheduleTable caption="Scheduled jobs" rows={schedule} now={systemNow} />);
    expect(screen.getByRole("columnheader", { name: /Last run/ })).toHaveClass("max-sm:hidden");
    expect(screen.getByRole("columnheader", { name: /Next run/ })).toHaveClass("max-sm:hidden");
    expect(screen.getByRole("columnheader", { name: /Last result/ })).not.toHaveClass(
      "max-sm:hidden",
    );
  });
});
