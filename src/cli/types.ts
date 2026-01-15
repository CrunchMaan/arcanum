export type BooleanArg = "yes" | "no"

export interface InstallArgs {
  tui: boolean
  antigravity?: BooleanArg
  openai?: BooleanArg
  cerebras?: BooleanArg
  skipAuth?: boolean
}

export interface InstallConfig {
  hasAntigravity: boolean
  hasOpenAI: boolean
  hasCerebras: boolean
}

export interface ConfigMergeResult {
  success: boolean
  configPath: string
  error?: string
}

export interface DetectedConfig {
  isInstalled: boolean
  hasAntigravity: boolean
  hasOpenAI: boolean
  hasCerebras: boolean
}
