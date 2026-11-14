#!/usr/bin/env node
// strata-api-types: generate an app's TypeScript API types from its OpenAPI schema (src/api-types/cli.ts, built into dist/).
import { main } from "../dist/api-types-cli.js";

process.exitCode = await main(process.argv.slice(2));
