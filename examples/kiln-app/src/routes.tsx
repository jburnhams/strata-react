// The kiln app's route tree, in its own module so the app (main.tsx) and its tests
// (tests/unit/testing.test.tsx, through renderRoutes) build their routers from the same objects.
// A test that hand-copied the tree would keep passing after the app's routes changed.
import type { RouteObject } from "react-router";
import * as React from "react";
import { useRef } from "react";
import {
  Alert,
  Button,
  Checkbox,
  ChoiceGroup,
  Field,
  Input,
  MediaPlayer,
  Meter,
  NativeSelect,
  PageHeader,
  PaletteChoice,
  Status,
  Switch,
  Tabs,
  Textarea,
  usePlayerWarnings,
  type SpanKind,
} from "../../../src";
import { states } from "../../../stories/fixtures/columns";
import { diskThresholds } from "../../../stories/fixtures/server";
import fullscreenClip from "../../../stories/fixtures/video/fullscreen.webm?url";
import { KilnRoomScreen } from "../../../stories/screens/kiln-room";

/** The base path the app is served under: `base` in ../vite.config.ts, without its trailing slash. */
export const basename = "/kiln";

const fullscreenSpanKinds = { intro: { label: "Intro", behaviour: "ask" } } satisfies Record<string, SpanKind>;

function FullscreenPlayer() {
  const { warning, warn } = usePlayerWarnings();
  const warned = useRef(false);
  return (
    <MediaPlayer
      kind="video"
      label="Kiln cam"
      src={fullscreenClip}
      controls="strata"
      spans={[{ start: 1, end: 11, kind: "intro" }]}
      spanKinds={fullscreenSpanKinds}
      status={<p role="status" className="type-body-sm">Playback details are loading</p>}
      warning={warning}
      onTimeChange={(time) => {
        if (time < 4 || warned.current) return;
        warned.current = true;
        warn({ title: "Playback details unavailable", timeout: 1000 });
      }}
    />
  );
}

// A page of every kind of control in each state, on the default look: what a person judges a theme by.
const GB = 1e9;
const tabs = [
  { value: "overview", label: "Overview" },
  { value: "readings", label: "Readings" },
  { value: "history", label: "History" },
];

function Controls() {
  const [firing, setFiring] = React.useState("glaze");
  const [lid, setLid] = React.useState(true);
  return (
    <main className="mx-auto grid max-w-5xl gap-10 p-8">
      <PageHeader title="Controls" scope="Strata's default look, every kind of control" actions={<><PaletteChoice compact /><Button variant="default">Book a firing</Button></>} />
      <section aria-label="Buttons" className="flex flex-wrap items-center gap-3">
        <Button variant="default">Book firing</Button>
        <Button>Message owners</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Withdraw booking</Button>
        <Button disabled>Booking…</Button>
        <Button size="sm">Small</Button>
      </section>
      <section aria-label="Status and alerts" className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {Object.entries(states).map(([key, s]) => (
            <Status key={key} tone={s.tone} icon={s.icon}>
              {s.label}
            </Status>
          ))}
        </div>
        <Alert tone="info">Readings from Kiln 2 are logged every five minutes.</Alert>
        <Alert tone="success" title="Imported">12 pieces added to the glaze library.</Alert>
        <Alert tone="warning" title="Kiln 2 is behind">Its last reading is 40 minutes old.</Alert>
        <Alert tone="danger" title="Export failed">The disk is full. Free some space and try again.</Alert>
      </section>
      <section aria-label="Form" className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-5">
          <Field label="Pieces" hint="Up to 20 per booking."><Input name="pieces" inputMode="numeric" defaultValue="6" /></Field>
          <Field label="Tallest piece (cm)" error="Kiln 2's shelves are 30 cm apart. Choose kiln 1, which takes up to 45 cm."><Input name="tallest" defaultValue="38" /></Field>
          <Field label="Kiln">
            <NativeSelect name="kiln" defaultValue="2">
              <option value="1">Kiln 1, large electric</option>
              <option value="2">Kiln 2, small electric</option>
            </NativeSelect>
          </Field>
          <Field label="Notes" hint="Optional."><Textarea name="notes" defaultValue="The lidded jar fires with its lid on." /></Field>
        </div>
        <div className="grid content-start gap-5">
          <ChoiceGroup
            legend="Firing"
            name="firing"
            value={firing}
            onChange={setFiring}
            choices={[
              { value: "bisque", label: "Bisque, cone 04", detail: "Fridays, out on Saturday after 10:00." },
              { value: "glaze", label: "Glaze, cone 6", detail: "Tuesdays and Thursdays." },
              { value: "raku", label: "Raku", detail: "Saturdays, in the yard." },
            ]}
          />
          <Switch label="Fire with the lid on" on={lid} onChange={setLid} />
          <Checkbox label="Glaze the foot ring" checked onCheckedChange={() => undefined} />
          <Checkbox label="Wax resist on the base" checked={false} onCheckedChange={() => undefined} />
        </div>
      </section>
      <section aria-label="Levels and tabs" className="grid gap-6 md:grid-cols-2">
        <div className="grid gap-5">
          <Meter label="/ (system and apps)" value={18.4 * GB} max={64 * GB} thresholds={diskThresholds} detail="18.4 GB of 64 GB" />
          <Meter label="/mnt/backup" value={1640 * GB} max={1863 * GB} thresholds={diskThresholds} detail="1.6 TB of 1.9 TB" />
          <Meter label="/srv/photos" value={431 * GB} max={466 * GB} thresholds={diskThresholds} detail="431 GB of 466 GB" />
        </div>
        <Tabs param="view" items={tabs} label="Kiln 2">
          {(v) => <p className="type-body py-4">Panel: {tabs.find((t) => t.value === v)?.label}</p>}
        </Tabs>
      </section>
    </main>
  );
}

export const routes: RouteObject[] = [
  { path: "/controls", element: <Controls /> },
  { path: "/fullscreen-player", element: <FullscreenPlayer /> },
  { path: "*", element: <KilnRoomScreen /> },
];
