#!/usr/bin/env node
// strata-stock-classes: list the stock Tailwind classes an app still uses (src/migrate/cli.ts, built into dist/).
import { main } from "../dist/migrate-cli.js";

process.exitCode = await main(process.argv.slice(2));
