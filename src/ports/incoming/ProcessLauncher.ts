export interface ProcessLauncher {
  launchTerminal(title: string): Promise<number | null>;
}
