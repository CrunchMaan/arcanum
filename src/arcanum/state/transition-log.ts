import * as fs from 'fs/promises';
import * as path from 'path';

export interface TransitionLogEntry {
  ts: string;           // ISO timestamp
  workflow: string;     // workflow id
  from: string;         // source step
  to: string;           // target step
  type?: 'transition' | 'invoke' | 'return';  // transition type
  gate?: string | any;  // gate that allowed transition (optional)
}

export class TransitionLog {
  private logPath: string;
  private maxEntries = 1000;

  constructor(projectDir: string) {
    this.logPath = path.join(projectDir, '.opencode', 'state', 'transitions.log.json');
  }

  /**
   * Append entry to log file
   */
  async append(entry: Omit<TransitionLogEntry, 'ts'>): Promise<void> {
    const fullEntry: TransitionLogEntry = {
      ...entry,
      ts: new Date().toISOString(),
    };

    let entries: TransitionLogEntry[] = [];
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      entries = JSON.parse(content);
    } catch (err) {
      // File might not exist yet
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }

    entries.push(fullEntry);

    // Trim oldest if exceeded
    if (entries.length > this.maxEntries) {
      entries = entries.slice(entries.length - this.maxEntries);
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });

    // Atomic write
    const tempPath = `${this.logPath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(entries, null, 2));
    await fs.rename(tempPath, this.logPath);
  }

  /**
   * Read last N entries
   */
  async tail(n = 20): Promise<TransitionLogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const entries: TransitionLogEntry[] = JSON.parse(content);
      return entries.slice(-n);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * Clear log
   */
  async clear(): Promise<void> {
    try {
      await fs.unlink(this.logPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
