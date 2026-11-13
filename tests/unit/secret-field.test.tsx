import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field, SecretField, type SecretFieldProps } from "../../src";
import { renderWithStrata } from "../../src/testing";

// Issue #221: a key the server keeps and never shows again.

function Host(props: Partial<SecretFieldProps>) {
  return (
    <form aria-label="Settings">
      <Field label="Map API key" hint="Kept on the server.">
        <SecretField noun="API key" isSet={false} {...props} />
      </Field>
    </form>
  );
}

describe("SecretField", () => {
  it("not set: a masked, no-autofill entry named by its Field, with Show named for what it reveals", async () => {
    const user = userEvent.setup();
    renderWithStrata(<Host />);
    const entry = screen.getByLabelText("Map API key");
    expect(entry).toHaveAttribute("type", "password");
    expect(entry).toHaveAttribute("autocomplete", "new-password");
    expect(entry).toHaveAccessibleDescription("Kept on the server.");
    await user.click(screen.getByRole("button", { name: "Show API key" }));
    expect(entry).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide API key" }));
    expect(entry).toHaveAttribute("type", "password");
  });

  it("set: says Set (and when), draws no input and no characters, and reports nothing on a form submit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const submitted = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderWithStrata(
      <form aria-label="Settings" onSubmit={submitted}>
        <Field label="Map API key">
          <SecretField noun="API key" isSet setAt="2026-11-12T14:02:00Z" onChange={onChange} name="mapKey" />
        </Field>
        <button type="submit">Save settings</button>
      </form>,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("input")).toBeNull();
    expect(screen.getByLabelText("Map API key")).toHaveTextContent(/^Set/);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(submitted).toHaveBeenCalled();
    expect(new FormData(screen.getByRole("form")).has("mapKey")).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("replace: reports what is typed, null on cancel, and goes back to Set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithStrata(<Host isSet onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Replace API key" }));
    await user.type(screen.getByLabelText("Map API key"), "abc");
    expect(onChange).toHaveBeenLastCalledWith("abc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(document.querySelector("input")).toBeNull();
  });

  it("saves through AsyncButton, then leaves no value in the DOM, and a refusal keeps the entry", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValueOnce(new Error("That key was refused.")).mockResolvedValue(undefined);
    function Saving() {
      const [isSet, setIsSet] = React.useState(false);
      return <Host isSet={isSet} onSave={async (v) => { await onSave(v); setIsSet(true); }} />;
    }
    renderWithStrata(<Saving />);
    const save = screen.getByRole("button", { name: /Save API key/ });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Map API key"), "sk-secret");
    await user.click(screen.getByRole("button", { name: /Save API key/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Try again/ })).toBeEnabled());
    expect(screen.getByLabelText("Map API key")).toHaveValue("sk-secret");
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(screen.getByLabelText("Map API key")).toHaveTextContent(/^Set/));
    expect(document.body.innerHTML).not.toContain("sk-secret");
    expect(document.querySelector("input")).toBeNull();
    expect(JSON.stringify({ ...localStorage })).not.toContain("sk-secret");
  });

  it("remove asks first, names what stops working, and Cancel is safe", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderWithStrata(<Host isSet onRemove={onRemove} consequence="Map labels stop loading until a new key is set." />);
    await user.click(screen.getByRole("button", { name: "Remove API key" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Map labels stop loading until a new key is set.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onRemove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove API key" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove API key" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("test: the stored key is tested as null; accepted and refused both read as text", async () => {
    const user = userEvent.setup();
    const test = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, message: "The provider says the key has expired." });
    renderWithStrata(<Host isSet test={test} />);
    await user.click(screen.getByRole("button", { name: "Test API key" }));
    expect(await screen.findByText("API key accepted")).toBeInTheDocument();
    expect(test).toHaveBeenLastCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Test API key" }));
    expect(await screen.findByText("The provider says the key has expired.")).toBeInTheDocument();
  });

  it("test while editing sends the typed value, and a throw is explained", async () => {
    const user = userEvent.setup();
    const test = vi.fn().mockRejectedValue(new Error("The provider could not be reached."));
    renderWithStrata(<Host test={test} />);
    expect(screen.getByRole("button", { name: "Test API key" })).toBeDisabled();
    await user.type(screen.getByLabelText("Map API key"), "k1");
    await user.click(screen.getByRole("button", { name: "Test API key" }));
    expect(test).toHaveBeenCalledWith("k1");
    expect(await screen.findByText("The provider could not be reached.")).toBeInTheDocument();
  });
});
