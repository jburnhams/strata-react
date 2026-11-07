#!/usr/bin/env node
// strata-visual: screenshot a Storybook build or an app's routes and compare with baselines.
// The command is src/visual/cli.ts, built into dist/; see strata-visual --help.
import { main } from "../dist/visual-cli.js";

process.exitCode = await main(process.argv.slice(2));
