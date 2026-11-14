// The strata-api-types command: generate an app's TypeScript API types from its OpenAPI schema (see generate.ts).
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { generateApiTypes, loadSchema } from "./generate";

const usage = `Usage: strata-api-types <schema> [options]

Writes TypeScript types for an app's API from its OpenAPI schema, so they follow the Python
server's instead of being written again by hand. <schema> is a URL (a running server, for example
http://localhost:8360/api/openapi.json) or a JSON file the server's CLI wrote, so CI needs no server.

  -o, --output <file>   the generated file (default src/api.generated.ts); commit it, never edit it
  --check               write nothing; exit 1 if the file is missing or differs from the schema (for CI)
  --help                show this
`;

/** Runs the command; the exit code. */
export async function main(argv: readonly string[], out: (text: string) => void = (t) => console.log(t), fetcher: typeof fetch = fetch): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options: { output: { type: "string", short: "o" }, check: { type: "boolean" }, help: { type: "boolean" } }, allowPositionals: true });
  } catch (e) {
    out(`${(e as Error).message}\n\n${usage}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    out(usage);
    return 0;
  }
  if (positionals.length !== 1) {
    out(`Give the schema to read: a URL or a JSON file.\n\n${usage}`);
    return 2;
  }
  const output = values.output ?? "src/api.generated.ts";
  try {
    const next = await generateApiTypes(await loadSchema(positionals[0]!, fetcher));
    if (values.check) {
      const current = existsSync(output) ? (await readFile(output, "utf8")).replace(/\r\n/g, "\n") : null;
      if (current === next) {
        out(`${output} matches the schema.`);
        return 0;
      }
      out(`${output} ${current === null ? "does not exist" : "no longer matches the schema"}. Regenerate it: strata-api-types ${positionals[0]} -o ${output}`);
      return 1;
    }
    await writeFile(output, next);
    out(`Wrote ${output}.`);
    return 0;
  } catch (e) {
    out((e as Error).message);
    return 1;
  }
}
