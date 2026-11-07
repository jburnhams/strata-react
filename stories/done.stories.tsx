import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Done } from "../src";

const meta = {
  title: "Feedback/Done",
  component: Done,
  args: {
    title: "Booked: 6 pieces in kiln 2's glaze firing on Tuesday",
    next: "Bring them to the to-fire shelf by 17:00 on Monday. They come out usually Wednesday afternoon, and we'll email you when they do.",
    focusOnMount: false,
    actions: (
      <>
        <Button variant="default">Back to the kiln room</Button>
        <Button variant="link">Book another firing</Button>
      </>
    ),
  },
} satisfies Meta<typeof Done>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The completion moment: what happened, past tense, with its object; and what happens next. */
export const Booked: Story = {};

/** The figure slot takes a drawing made from the person's own data, never a stock illustration. */
export const WithFigure: Story = {
  args: {
    figure: (
      <svg width="240" height="64" role="img" aria-label="Your 6 pieces on kiln 2's middle shelf" className="block">
        <rect x="0" y="56" width="240" height="4" fill="var(--neutral-8)" />
        <g className="enter-moment">
          {[24, 18, 30, 14, 26, 20].map((h, i) => (
            <rect key={i} x={12 + i * 38} y={56 - h} width="24" height={h} rx="3" fill="var(--primary)" />
          ))}
        </g>
      </svg>
    ),
  },
};
