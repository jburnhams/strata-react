// A pretend server disk for the folder picker (issue #188): a few real-looking folders, one with
// 500 entries, one that is slow, one that refuses. Paths use `/`. Made folders are kept in memory so
// a story and a test can see a folder appear; `resetFolders()` puts the disk back.

export type DiskFolder = { path: string; name: string; count: number };

const base: Record<string, string[]> = {
  "/": ["archive", "home", "media", "srv"],
  "/home": ["ada", "shared"],
  "/home/ada": ["Documents", "Pictures", "Projects", "slow-share", "locked"],
  "/home/ada/Projects": ["kiln-room", "strata-react", "film-2026", "notes"],
  "/home/ada/Projects/film-2026": ["rushes", "exports", "stills"],
  "/home/ada/Pictures": ["2025", "2026"],
  "/home/shared": ["templates"],
  "/media": ["library", "backup"],
  "/media/library": Array.from({ length: 500 }, (_, i) => `episode-${String(i + 1).padStart(3, "0")}`),
  "/srv": ["www"],
  "/archive": [],
};

let added: Record<string, string[]> = {};

export const resetFolders = () => {
  added = {};
};

const join = (parent: string, name: string) => `${parent === "/" ? "" : parent}/${name}`;
const kids = (path: string): string[] | undefined => {
  const own = base[path];
  const more = added[path];
  return own || more ? [...(own ?? []), ...(more ?? [])] : undefined;
};

/** The folders inside `path`. A folder not listed above has none. */
export function listDisk(path: string): DiskFolder[] {
  return [...(kids(path) ?? [])]
    .sort((x, y) => x.localeCompare(y))
    .map((name) => ({ path: join(path, name), name, count: kids(join(path, name))?.length ?? 0 }));
}

/** Makes a folder; returns the reason when it cannot be made. */
export function makeFolder(parent: string, name: string): { ok: true } | { ok: false; status: number; reason: string } {
  if (!name.trim() || /[\\/:*?"<>|]/.test(name)) return { ok: false, status: 422, reason: `A folder name cannot contain \\ / : * ? " < > |.` };
  if ((kids(parent) ?? []).some((n) => n.toLowerCase() === name.toLowerCase())) return { ok: false, status: 409, reason: `A folder named ${name} already exists in ${parent}.` };
  if (parent.endsWith("/locked")) return { ok: false, status: 403, reason: `You do not have permission to make folders in ${parent}.` };
  added[parent] = [...(added[parent] ?? []), name];
  return { ok: true };
}
