import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// Define base configuration directory based on OS
const isWindows = os.platform() === "win32";
const configBase = isWindows
  ? path.join(os.homedir(), "AppData", "Roaming", "opencode")
  : path.join(os.homedir(), ".config", "opencode");

const commandDir = path.join(configBase, "command");

export function registerArcanumCommands(): void {
  // Ensure command directory exists
  try {
    if (!fs.existsSync(commandDir)) {
      fs.mkdirSync(commandDir, { recursive: true });
    }

    // /arcanum-status
    fs.writeFileSync(
      path.join(commandDir, "arcanum-status.md"),
      `---
description: Show current Arcanum workflow status
---
Call the \`arcanum_status\` tool to display the current workflow state, step, and available transitions.
`,
      "utf-8"
    );

    // /arcanum-transition
    fs.writeFileSync(
      path.join(commandDir, "arcanum-transition.md"),
      `---
description: Transition to a different workflow step
---
Ask the user which step to transition to, then call \`arcanum_transition\` with the target step.
Available steps can be seen via \`arcanum_status\`.
`,
      "utf-8"
    );

    // /arcanum-history
    fs.writeFileSync(
      path.join(commandDir, "arcanum-history.md"),
      `---
description: Show workflow transition history
---
Show the recent workflow transitions. Run the arcanum history CLI command or describe the transition log.
`,
      "utf-8"
    );
  } catch (error) {
    console.error("Failed to create Arcanum command files/directory:", error);
  }
}
