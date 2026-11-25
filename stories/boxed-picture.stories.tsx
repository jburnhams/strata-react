import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageOff } from "lucide-react";
import { BoxList, BoxedPicture, Thumbnail, useBoxes } from "../src";
import { PHOTO_SIZE, groupPhoto, photoFaces } from "./fixtures/faces";

// strata-models' face store: a face opened from a grid lands on that face in its photo, with the
// other faces in the photo boxed and listed beside it. Choosing one in the list or the picture zooms
// to it. The crops in the list are `Thumbnail region`, cut by the browser from the same photo.

function FaceInPhoto({ chosen = "f2", zoom = true, src = groupPhoto }: { chosen?: string | null; zoom?: boolean; src?: string | null }) {
  const state = useBoxes(chosen);
  return (
    <div className="grid max-w-4xl grid-cols-[minmax(0,1fr)_14rem] items-start gap-4">
      <BoxedPicture label="Photo from the kiln opening" src={src} alt="" missing="Photo not kept" of={PHOTO_SIZE} boxes={photoFaces} state={state} boxesLabel="Faces in this photo" zoom={zoom} />
      <BoxList
        label="Faces in this photo"
        boxes={photoFaces}
        state={state}
        renderBox={(b) => (
          <span className="flex items-center gap-2">
            <Thumbnail
              src={src}
              alt=""
              region={{ of: PHOTO_SIZE, box: b }}
              eager
              className="w-10 shrink-0"
              // Too small for words: the frame beside it already says the photo is not kept.
              fallback={<ImageOff aria-hidden className="size-4 place-self-center text-muted-foreground" />}
            />
            <span className="min-w-0">{b.label.replace(/^Face \d+: /, "")}</span>
          </span>
        )}
      />
    </div>
  );
}

const meta = { title: "Data/BoxedPicture", component: FaceInPhoto, parameters: { layout: "padded" }, tags: ["visual-wide"] } satisfies Meta<typeof FaceInPhoto>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Opened on the face that is not named yet: zoomed to it, its box chosen, the list holding it. */
export const OpenedOnAFace: Story = {};

/** `zoom={false}`: the whole photo, the chosen face filled, the others outlined in their tones. */
export const WholePhoto: Story = { args: { zoom: false, chosen: "f1" } };

/** The photo was not kept: the frame says so in the product's words, and the faces are still there to choose. */
export const PhotoNotKept: Story = { args: { src: null, chosen: null } };
