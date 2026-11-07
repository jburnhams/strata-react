// Fixture columns and state map for the kiln room's bookings, shared by the table stories and the
// composed screen. A product maps its own states onto Status tones once, in one table like this.
import { CalendarClock, Check, Flame, Layers, Thermometer, TriangleAlert } from "lucide-react";
import { Status, format, type Column, type IconComponent, type Tone } from "../../src";
import { glazeNames, type Booking, type KilnState } from "./kiln";

export const states: Record<KilnState, { tone: Tone; icon: IconComponent; label: string }> = {
  booked: { tone: "neutral", icon: CalendarClock, label: "Booked" },
  loading: { tone: "neutral", icon: Layers, label: "Loading" },
  firing: { tone: "warning", icon: Flame, label: "Firing" },
  cooling: { tone: "warning", icon: Thermometer, label: "Cooling" },
  ready: { tone: "success", icon: Check, label: "Ready to collect" },
  fault: { tone: "danger", icon: TriangleAlert, label: "Fault" },
};

export const bookingColumns: Column<Booking>[] = [
  { key: "member", header: "Member", cell: (b) => b.member, sort: (a, b) => a.member.localeCompare(b.member), className: "whitespace-nowrap" },
  { key: "pieces", header: "Pieces", cell: (b) => format.integer.format(b.pieces), numeric: true, sort: (a, b) => a.pieces - b.pieces },
  { key: "kiln", header: "Kiln", cell: (b) => `Kiln ${b.kiln}`, className: "whitespace-nowrap" },
  { key: "glaze", header: "Glaze", cell: (b) => glazeNames[b.glaze], className: "whitespace-nowrap" },
  {
    key: "state",
    header: "State",
    cell: (b) => {
      const s = states[b.state];
      return (
        <Status tone={s.tone} icon={s.icon}>
          {s.label}
        </Status>
      );
    },
  },
  { key: "out", header: "Out", cell: (b) => b.out, truncate: true },
];
