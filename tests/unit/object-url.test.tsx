import { describe, expect, it, vi } from "vite-plus/test";
import * as React from "react";
import { render, renderHook } from "@testing-library/react";
import { useObjectUrl } from "../../src";

// Issue #367: bytes or a Blob as a URL, made once per value and revoked when it changes or on unmount,
// Strict Mode safe. jsdom's `URL` has no object URLs, so this keeps the real bookkeeping (what is made
// and what is revoked) in a small stand-in for the browser's blob store.

function installBlobStore() {
  const made = new Map<string, Blob>();
  const revoked: string[] = [];
  let n = 0;
  const create = vi.fn((blob: Blob) => {
    const url = `blob:test/${++n}`;
    made.set(url, blob);
    return url;
  });
  const revoke = vi.fn((url: string) => void revoked.push(url));
  const before = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  URL.createObjectURL = create as never;
  URL.revokeObjectURL = revoke as never;
  return {
    made,
    revoked,
    restore: () => Object.assign(URL, { createObjectURL: before.create, revokeObjectURL: before.revoke }),
  };
}

describe("useObjectUrl", () => {
  it("is null first, then a URL for the bytes with the type given", async () => {
    const store = installBlobStore();
    const bytes = new Uint8Array([1, 2, 3]);
    const { result } = renderHook(() => useObjectUrl(bytes, "audio/wav"));
    expect(result.current).toBe("blob:test/1");
    const blob = store.made.get("blob:test/1")!;
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(3);
    store.restore();
  });

  it("keeps the URL while the value is the same and revokes the old one when it changes", () => {
    const store = installBlobStore();
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2, 2]);
    const { result, rerender } = renderHook(({ data }) => useObjectUrl(data), {
      initialProps: { data: a },
    });
    const first = result.current;
    rerender({ data: a });
    expect(result.current).toBe(first);
    expect(store.revoked).toEqual([]);
    rerender({ data: b });
    expect(store.revoked).toEqual([first]);
    expect(result.current).not.toBe(first);
    store.restore();
  });

  it("revokes on unmount, and for null data is null and makes nothing", () => {
    const store = installBlobStore();
    const blob = new Blob(["x"], { type: "image/png" }); // held once: a new value every render would be a new URL every render
    const { result, unmount } = renderHook(() => useObjectUrl(blob));
    expect(result.current).toBe("blob:test/1");
    unmount();
    expect(store.revoked).toEqual(["blob:test/1"]);
    const empty = renderHook(() => useObjectUrl(null));
    expect(empty.result.current).toBeNull();
    expect(store.made.size).toBe(1);
    store.restore();
  });

  it("leaves nothing behind under Strict Mode's rehearsal", () => {
    const store = installBlobStore();
    const bytes = new Uint8Array([9]);
    const Probe = () => <a href={useObjectUrl(bytes) ?? undefined}>file</a>;
    const { unmount, container } = render(
      <React.StrictMode>
        <Probe />
      </React.StrictMode>,
    );
    expect(container.querySelector("a")?.getAttribute("href")).toMatch(/^blob:/);
    unmount();
    expect(store.revoked.sort()).toEqual([...store.made.keys()].sort());
    store.restore();
  });

  it("a Blob with its own type keeps it unless a type is given", () => {
    const store = installBlobStore();
    const blob = new Blob(["x"], { type: "image/png" });
    renderHook(() => useObjectUrl(blob));
    expect(store.made.get("blob:test/1")).toBe(blob);
    renderHook(() => useObjectUrl(blob, "image/webp"));
    expect(store.made.get("blob:test/2")!.type).toBe("image/webp");
    store.restore();
  });
});
