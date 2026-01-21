#!/usr/bin/env bun
import { runArcanumCli } from "../arcanum/cli";

runArcanumCli(process.argv.slice(2))
  .then(code => process.exit(code))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
