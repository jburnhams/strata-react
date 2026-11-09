import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import {
  AsyncButton,
  Field,
  HttpError,
  Input,
  describeActionError,
  describeHttpError,
  fetchJson,
  readErrorBody,
  useAsyncAction,
} from "../../src";
import { server } from "../utils/server";
import { api, inviteInvalid, inviteTaken } from "../../stories/mocks/handlers";

// Issue #42: a server's reason for a 4xx reaches the person, and per-field messages reach their
// Field. Issue #46: a one-field form with its button on the control's row, and validation that
// writes to the field without a hand-kept problem state.

const caught = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("did not throw");
};

describe("fetchJson keeps an error response's body", () => {
  it("reads FastAPI's detail as the reason", async () => {
    server.use(
      http.put("/api/settings", () =>
        HttpResponse.json({ detail: "the data folder must be an absolute path" }, { status: 400, statusText: "Bad Request" }),
      ),
    );
    const error = await caught(fetchJson("/api/settings", { method: "PUT", body: "{}" }));
    expect(error).toBeInstanceOf(HttpError);
    const e = error as HttpError;
    expect(e.status).toBe(400);
    expect(e.body).toEqual({ detail: "the data folder must be an absolute path" });
    expect(e.reason).toBe("the data folder must be an absolute path");
    expect(describeActionError(e)).toBe("The request was refused: the data folder must be an absolute path.");
    expect(describeHttpError(e)).toBe("The request was refused: the data folder must be an absolute path.");
  });

  it("maps a 422's per-field messages by field name", async () => {
    server.use(inviteInvalid);
    const e = (await caught(fetchJson(api.invites, { method: "POST", body: "{}" }))) as HttpError;
    expect(e.fieldErrors).toEqual({ email: "Use the address the member signs in with, ending in .org or .com" });
    expect(describeActionError(e)).toBe("The request was refused: check the fields marked.");
  });

  it("still throws HttpError for a proxy's HTML page or an empty body, and does not show a 5xx body", async () => {
    server.use(
      http.get("/api/html", () => new HttpResponse("<html><body>Bad gateway</body></html>", { status: 502, statusText: "Bad Gateway" })),
      http.get("/api/empty", () => new HttpResponse(null, { status: 404, statusText: "Not Found" })),
    );
    const html = (await caught(fetchJson("/api/html"))) as HttpError;
    expect(html).toBeInstanceOf(HttpError);
    expect(html.body).toBe("<html><body>Bad gateway</body></html>");
    expect(html.reason).toBeUndefined();
    expect(describeActionError(html)).toBe("The server could not answer (502).");
    const empty = (await caught(fetchJson("/api/empty"))) as HttpError;
    expect(empty.body).toBeUndefined();
    expect(describeHttpError(empty)).toBe("The request was refused (404): Not Found.");
  });

  it("takes an API's own reading of its error bodies", async () => {
    server.use(http.get("/api/odd", () => HttpResponse.json({ problem: { text: "quota spent" } }, { status: 429, statusText: "Too Many Requests" })));
    const e = (await caught(
      fetchJson("/api/odd", undefined, { readError: (b) => ({ reason: (b as { problem: { text: string } }).problem.text }) }),
    )) as HttpError;
    expect(describeActionError(e)).toBe("The request was refused: quota spent.");
  });
});

describe("readErrorBody", () => {
  it("reads the common shapes", () => {
    expect(readErrorBody({ message: "Name taken." })).toEqual({ reason: "Name taken." });
    expect(readErrorBody({ error: "nope" })).toEqual({ reason: "nope" });
    expect(readErrorBody({ error: { message: "deep" } })).toEqual({ reason: "deep" });
    expect(readErrorBody("plain words")).toEqual({ reason: "plain words" });
    expect(readErrorBody("<!doctype html>")).toEqual({});
    expect(readErrorBody(undefined)).toEqual({});
    expect(
      readErrorBody({
        detail: [
          { loc: ["body", "address", "city"], msg: "Required" },
          { loc: ["query", "page"], msg: "Must be a number" },
        ],
      }),
    ).toEqual({ fields: { "address.city": "Required", page: "Must be a number" } });
  });
});

// The one-field form from the issue: "Invite by email", the button on the input's row.
function InviteForm({ onInvalid }: { onInvalid?: () => void }) {
  const [email, setEmail] = React.useState("");
  const invite = useAsyncAction(
    (address: string) => fetchJson(api.invites, { method: "POST", body: JSON.stringify({ email: address }) }),
    {
      validate: (address) => ({ email: address.trim() ? undefined : "Type the member's email address." }),
      onInvalid,
    },
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void invite.run(email);
      }}
    >
      <Field
        label="Invite by email"
        hint="They get a link to set a password."
        error={invite.fieldErrors.email ?? (invite.phase === "error" && !invite.fieldErrors.email ? invite.error : undefined)}
        action={
          <AsyncButton
            type="submit"
            variant="default"
            phase={invite.phase}
            labels={{ idle: "Invite", pending: "Inviting…", done: "Invited" }}
          />
        }
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            invite.clearFieldError("email");
          }}
        />
      </Field>
    </form>
  );
}

describe("useAsyncAction's field messages", () => {
  it("validates before running, keeps the button idle, and clears the message as the person types", async () => {
    let invalid = 0;
    render(<InviteForm onInvalid={() => invalid++} />);
    const button = screen.getByRole("button", { name: "Invite" });
    await userEvent.click(button);
    const input = screen.getByLabelText("Invite by email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Type the member's email address. They get a link to set a password.");
    expect(button).toHaveAttribute("data-phase", "idle");
    expect(invalid).toBe(1);
    await userEvent.type(input, "a");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("puts a server's 422 message under its field", async () => {
    server.use(inviteInvalid);
    render(<InviteForm />);
    await userEvent.type(screen.getByLabelText("Invite by email"), "ada@example.net");
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Invite by email")).toHaveAccessibleDescription(
        "Use the address the member signs in with, ending in .org or .com They get a link to set a password.",
      ),
    );
  });

  it("shows the server's sentence for a refusal only it can check, and exposes what was thrown", async () => {
    server.use(inviteTaken);
    let thrown: unknown;
    function Probe() {
      const action = useAsyncAction(() => fetchJson(api.invites, { method: "POST" }));
      thrown = action.thrown;
      return <AsyncButton phase={action.phase} error={action.error} labels={{ idle: "Invite", pending: "Inviting…", done: "Invited" }} onClick={() => action.run()} />;
    }
    render(<Probe />);
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("The request was refused: ada@example.org is already a member of the studio. Try again"),
    );
    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).status).toBe(409);
  });
});

describe("Field's action", () => {
  it("draws the action on the control's row, with the hint and error under both and describing only the input", () => {
    render(
      <Field label="Channel link" hint="Paste a channel's address." error="That is not a link." action={<button type="button">Add</button>}>
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Channel link");
    const button = screen.getByRole("button", { name: "Add" });
    // Input and button share one row element; the messages come after it.
    const row = button.parentElement!.parentElement!;
    expect(row).toContainElement(input);
    expect(row.nextElementSibling).toHaveTextContent("That is not a link.");
    expect(input).toHaveAccessibleDescription("That is not a link. Paste a channel's address.");
    expect(button).not.toHaveAttribute("aria-describedby");
  });
});
