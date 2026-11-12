import { describe, expect, it } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoiceGroup, Field, Input, NativeSelect } from "../../src";

describe("Field", () => {
  it("labels its control and describes it with the error first, then the hint", () => {
    render(
      <Field label="Tallest piece (cm)" hint="Kiln 2 has 30 cm between shelves." error="Your piece is 38 cm; choose kiln 1.">
        <Input name="tallest" />
      </Field>,
    );
    const input = screen.getByLabelText("Tallest piece (cm)");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Your piece is 38 cm; choose kiln 1. Kiln 2 has 30 cm between shelves.");
  });

  it("is not invalid without an error", () => {
    render(
      <Field label="Kiln">
        <NativeSelect>
          <option>Kiln 1</option>
        </NativeSelect>
      </Field>,
    );
    expect(screen.getByLabelText("Kiln")).not.toHaveAttribute("aria-invalid");
  });
});

describe("Field ids", () => {
  it("keeps the label on the control when an id is chosen on the Field", () => {
    render(
      <Field label="Name" id="name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toHaveAttribute("id", "name");
  });

  it("keeps the label on the control even if the control is given its own id", () => {
    render(
      <Field label="Name">
        <Input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
});

describe("ChoiceGroup", () => {
  it("is a radio group where the whole row selects", async () => {
    function Choices() {
      const [value, setValue] = React.useState("glaze");
      return (
        <ChoiceGroup
          legend="Firing"
          name="firing"
          value={value}
          onChange={setValue}
          choices={[
            { value: "bisque", label: "Bisque, cone 04", detail: "Fridays." },
            { value: "glaze", label: "Glaze, cone 6" },
          ]}
        />
      );
    }
    render(<Choices />);
    expect(screen.getByRole("radiogroup", { name: "Firing" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Fridays."));
    expect(screen.getByRole("radio", { name: /Bisque/ })).toBeChecked();
  });
});
