import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
    ITerminalDriver,
    KeyEventHandler,
    ResizeHandler,
} from "../domain/tui-port.js";
import type { TerminalSize, TuiKeyEvent } from "../domain/tui-types.js";

/**
 * Parses a raw stdin buffer (ANSI escape sequences + UTF-8 chars) into TuiKeyEvent objects.
 */
export function parseRawKeys(buffer: Buffer): TuiKeyEvent[] {
    const input = buffer.toString("utf8");
    const events: TuiKeyEvent[] = [];
    let index = 0;

    while (index < input.length) {
        const ch = input[index];

        if (ch === "\u0003") {
            events.push({ name: "ctrl-c" });
            index += 1;
            continue;
        }
        if (ch === "\u0012") {
            events.push({ name: "ctrl-r" });
            index += 1;
            continue;
        }
        if (ch === "\u0015") {
            events.push({ name: "ctrl-u" });
            index += 1;
            continue;
        }
        if (ch === "\u0001") {
            events.push({ name: "home" });
            index += 1;
            continue;
        }
        if (ch === "\u0005") {
            events.push({ name: "end" });
            index += 1;
            continue;
        }

        if (ch === "\u001b") {
            const next2 = input.slice(index, index + 3);
            const next4 = input.slice(index, index + 4);

            if (next4 === "\u001b[3~") {
                events.push({ name: "delete" });
                index += 4;
                continue;
            }
            if (next4 === "\u001b[1~") {
                events.push({ name: "home" });
                index += 4;
                continue;
            }
            if (next4 === "\u001b[4~") {
                events.push({ name: "end" });
                index += 4;
                continue;
            }
            if (next2 === "\u001b[A" || next2 === "\u001bOA") {
                events.push({ name: "up" });
                index += 3;
                continue;
            }
            if (next2 === "\u001b[B" || next2 === "\u001bOB") {
                events.push({ name: "down" });
                index += 3;
                continue;
            }
            if (next2 === "\u001b[C" || next2 === "\u001bOC") {
                events.push({ name: "right" });
                index += 3;
                continue;
            }
            if (next2 === "\u001b[D" || next2 === "\u001bOD") {
                events.push({ name: "left" });
                index += 3;
                continue;
            }
            if (next2 === "\u001b[H" || next2 === "\u001bOH") {
                events.push({ name: "home" });
                index += 3;
                continue;
            }
            if (next2 === "\u001b[F" || next2 === "\u001bOF") {
                events.push({ name: "end" });
                index += 3;
                continue;
            }
            if (next2 === "\u001b[Z") {
                events.push({ name: "shift-tab" });
                index += 3;
                continue;
            }

            if (index + 1 < input.length && input[index + 1] === "O") {
                index += Math.min(3, input.length - index);
                continue;
            }

            if (index + 1 < input.length && input[index + 1] === "[") {
                // Consume unrecognized CSI sequence cleanly until final ASCII byte (0x40..0x7E)
                let end = index + 2;
                while (end < input.length) {
                    const code = input.charCodeAt(end);
                    end += 1;
                    if (code >= 0x40 && code <= 0x7e) {
                        break;
                    }
                }
                index = end;
                continue;
            }

            events.push({ name: "escape" });
            index += 1;
            continue;
        }

        if (ch === "\r" || ch === "\n") {
            events.push({ name: "enter" });
            index += ch === "\r" && input[index + 1] === "\n" ? 2 : 1;
            continue;
        }

        if (ch === "\t") {
            events.push({ name: "tab" });
            index += 1;
            continue;
        }

        if (ch === "\u007f" || ch === "\b") {
            events.push({ name: "backspace" });
            index += 1;
            continue;
        }

        if (ch === " ") {
            events.push({ name: "space", char: " " });
            index += 1;
            continue;
        }

        if (ch >= " " || ch === "\t") {
            events.push({ name: "char", char: ch });
        }

        index += 1;
    }

    return events;
}

export class AnsiTerminalDriver implements ITerminalDriver {
    private inAltScreen = false;

    isInteractive(): boolean {
        return Boolean(process.stdin.isTTY && process.stdout.isTTY);
    }

    getSize(): TerminalSize {
        const columns = process.stdout.columns;
        const rows = process.stdout.rows;
        return {
            columns: columns && columns > 0 ? columns : 100,
            rows: rows && rows > 0 ? rows : 32,
        };
    }

    enterAlternateScreen(): void {
        if (this.inAltScreen) {
            return;
        }

        if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();

        process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l");
        this.inAltScreen = true;
    }

    exitAlternateScreen(): void {
        if (!this.inAltScreen) {
            return;
        }

        this.inAltScreen = false;
        process.stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l");

        if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
            process.stdin.setRawMode(false);
        }
        process.stdin.pause();
    }

    writeFrame(frame: string): void {
        const lines = frame.split("\n");
        const rendered = lines.map((line) => `${line}\x1b[K`).join("\n");
        process.stdout.write(`\x1b[?2026h\x1b[H${rendered}\x1b[J\x1b[?2026l`);
    }

    onKey(handler: KeyEventHandler): () => void {
        const listener = (chunk: Buffer) => {
            for (const key of parseRawKeys(chunk)) {
                handler(key);
            }
        };

        process.stdin.on("data", listener);
        return () => {
            process.stdin.off("data", listener);
        };
    }

    onResize(handler: ResizeHandler): () => void {
        const listener = () => {
            handler(this.getSize());
        };

        process.stdout.on("resize", listener);
        return () => {
            process.stdout.off("resize", listener);
        };
    }

    async readTextFile(filePath: string): Promise<string> {
        return readFile(filePath, "utf8");
    }

    async openInEditor(initialContent: string): Promise<string> {
        const tempDir = await mkdtemp(join(tmpdir(), "loadforge-edit-"));
        const tempFile = join(tempDir, "body.json");
        await writeFile(tempFile, initialContent, "utf8");

        const editor =
            process.env.VISUAL ||
            process.env.EDITOR ||
            (process.platform === "win32" ? "notepad" : "nano");

        const wasAlt = this.inAltScreen;
        if (wasAlt) {
            this.exitAlternateScreen();
        }

        try {
            spawnSync(editor, [tempFile], { stdio: "inherit" });
            return await readFile(tempFile, "utf8");
        } finally {
            await rm(tempDir, { recursive: true, force: true }).catch(() => {});
            if (wasAlt) {
                this.enterAlternateScreen();
            }
        }
    }
}
