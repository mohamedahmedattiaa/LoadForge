import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IPreferencesRepository } from "../domain/tui-port.js";
import { createDefaultPreferences } from "../domain/tui-state-service.js";
import type { TuiPreferences } from "../domain/tui-types.js";

export class FilePreferencesRepository implements IPreferencesRepository {
    private readonly filePath: string;

    constructor(filePath?: string) {
        this.filePath =
            filePath ?? join(homedir(), ".loadforge", "preferences.json");
    }

    getPreferencesPath(): string {
        return this.filePath;
    }

    async load(): Promise<TuiPreferences> {
        const defaults = createDefaultPreferences();

        try {
            const raw = await readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw) as Partial<TuiPreferences>;
            return {
                ...defaults,
                ...parsed,
            };
        } catch {
            return defaults;
        }
    }

    async save(preferences: TuiPreferences): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(
            this.filePath,
            JSON.stringify(preferences, null, 2),
            "utf8"
        );
    }
}
