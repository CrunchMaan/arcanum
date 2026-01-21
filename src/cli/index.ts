#!/usr/bin/env bun
import { install } from "./install"
import { runArcanumCli } from "../arcanum/cli"
import type { InstallArgs, BooleanArg } from "./types"

function parseArgs(args: string[]): InstallArgs {
  const result: InstallArgs = {
    tui: true,
  }

  for (const arg of args) {
    if (arg === "--no-tui") {
      result.tui = false
    } else if (arg === "--skip-auth") {
      result.skipAuth = true
    } else if (arg.startsWith("--antigravity=")) {
      result.antigravity = arg.split("=")[1] as BooleanArg
    } else if (arg.startsWith("--openai=")) {
      result.openai = arg.split("=")[1] as BooleanArg
    } else if (arg.startsWith("--tmux=")) {
      result.tmux = arg.split("=")[1] as BooleanArg
    } else if (arg === "-h" || arg === "--help") {
      printHelp()
      process.exit(0)
    }
  }

  return result
}

function printHelp(): void {
  console.log(`
oh-my-opencode-slim

Usage: bunx oh-my-opencode-slim <command> [OPTIONS]

Commands:
  install            Install and configure the plugin
  arcanum <cmd>      Protocol execution engine commands

Arcanum Commands:
  arcanum init       Initialize protocol from template
  arcanum status     Show current workflow state
  arcanum validate   Validate protocol against schemas
  arcanum run        Execute workflow step
  arcanum reset      Reset state to initial
  arcanum templates  List available templates

Install Options:
  --antigravity=yes|no   Antigravity subscription (yes/no)
  --openai=yes|no        OpenAI API access (yes/no)
  --tmux=yes|no          Enable tmux integration (yes/no)
  --no-tui               Non-interactive mode (requires all flags)
  --skip-auth            Skip authentication reminder
  -h, --help             Show this help message

Examples:
  bunx oh-my-opencode-slim install
  bunx oh-my-opencode-slim arcanum init ralph
  bunx oh-my-opencode-slim arcanum status
`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === "install") {
    const installArgs = parseArgs(args.slice(args[0] === "install" ? 1 : 0))
    const exitCode = await install(installArgs)
    process.exit(exitCode)
  } else if (args[0] === "arcanum") {
    // Arcanum CLI commands
    const exitCode = await runArcanumCli(args.slice(1))
    process.exit(exitCode)
  } else if (args[0] === "-h" || args[0] === "--help") {
    printHelp()
    process.exit(0)
  } else {
    console.error(`Unknown command: ${args[0]}`)
    console.error("Run with --help for usage information")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
