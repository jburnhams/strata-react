// A static file server for a build folder, on a free local port. Storybook needs nothing more;
// an app's build also needs history fallback (a request for /review that asks for HTML gets
// index.html, as a host like Pages or Netlify would serve it) and its Vite `base`. Requests that
// do not ask for HTML are never given index.html, so a missed API route fails loudly as a 404
// instead of a JSON parse error.
//
// An app built with a relative Vite `base: './'` (python-app-template, for reverse proxies) gets a
// `<base href>` back to its root from its own server in production. A plain file server does not,
// so `/books/1` would ask for `/books/assets/index.js` and paint an empty page (issue #242). In
// spa mode the index.html this server sends therefore gets `<base href="{prefix}">` unless it
// already has a base tag, which is what the app's server does for it.
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, normalize, resolve, sep } from "node:path";

const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};

/** A running server: its origin plus base, and how to stop it. */
export interface StaticServer {
  /** e.g. `http://127.0.0.1:53121/app/` (always ends in `/`). */
  url: string;
  close(): Promise<void>;
}

/** The page with `<base href="{href}">` first in its head, unless it already has a base tag. */
export function withBaseTag(html: string, href: string): string {
  if (/<base[\s>]/i.test(html)) return html;
  const tag = `<base href="${href}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${html}`;
}

/** Serves `dir` on 127.0.0.1 under `base`, with history fallback to `index.html` when `spa` is set. */
export async function serveStatic(dir: string, { spa = false, base = "/" }: { spa?: boolean; base?: string } = {}): Promise<StaticServer> {
  const root = resolve(dir);
  const prefix = `/${base.replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (!pathname.startsWith(prefix) && `${pathname}/` !== prefix) {
      res.writeHead(404).end();
      return;
    }
    const rel = normalize(pathname.slice(prefix.length)).replace(/^([/\\])+/, "");
    let file = join(root, rel || "index.html");
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      const wantsHtml = (req.headers.accept ?? "").includes("text/html");
      if (!spa || !wantsHtml || !existsSync(join(root, "index.html"))) {
        res.writeHead(404).end();
        return;
      }
      file = join(root, "index.html");
    }
    if (spa && extname(file) === ".html" && basename(file) === "index.html") {
      const html = withBaseTag(readFileSync(file, "utf8"), prefix);
      res.writeHead(200, { "Content-Type": "text/html", "Service-Worker-Allowed": "/" }).end(html);
      return;
    }
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Service-Worker-Allowed": "/" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}${prefix}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
