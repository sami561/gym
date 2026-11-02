import * as readline from 'readline';

/**
 * USB QR scanners in keyboard mode "type" the code followed by Enter. When the agent runs in a
 * terminal (kiosk PC, Raspberry Pi console), each line on stdin is a scan.
 */
export function startStdinScanner(onCode: (code: string) => void): () => void {
  if (!process.stdin.readable) return () => undefined;
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const code = line.trim();
    if (code) onCode(code);
  });
  return () => rl.close();
}
