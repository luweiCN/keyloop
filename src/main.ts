#!/usr/bin/env bun

import { runCli } from "./cli";
import { createOpenTuiStartRunner } from "./ui/opentui/startRunner";

try {
  const result = await runCli(process.argv.slice(2), {
    runner: createOpenTuiStartRunner(),
  });
  process.stdout.write(result.stdout);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
