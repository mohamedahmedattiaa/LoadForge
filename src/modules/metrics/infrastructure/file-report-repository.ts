import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
    IReportRepository,
    NewSavedReportInput,
    SavedReportRecord,
    StoredReportEntry,
} from "../domain/report-repository-port.js";

function formatFileTimestamp(isoTimestamp: string): string {
    return isoTimestamp.replace(/[:.]/g, "-").slice(0, 23);
}

function isValidSavedReport(value: unknown): value is SavedReportRecord {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === "string" &&
        (candidate.kind === "load-test" || candidate.kind === "capacity") &&
        typeof candidate.createdAt === "string" &&
        typeof candidate.targetUrl === "string" &&
        typeof candidate.method === "string" &&
        typeof candidate.report === "object" &&
        candidate.report !== null
    );
}

export class FileReportRepository implements IReportRepository {
    private readonly directory: string;

    constructor(directory?: string) {
        this.directory =
            directory ?? join(homedir(), ".loadforge", "reports");
    }

    getReportsDirectory(): string {
        return this.directory;
    }

    async save(input: NewSavedReportInput): Promise<StoredReportEntry> {
        await mkdir(this.directory, { recursive: true });

        const now = new Date();
        const createdAt = now.toISOString();
        const id = `loadforge-report-${formatFileTimestamp(createdAt)}`;
        const filePath = join(this.directory, `${id}.json`);

        const record: SavedReportRecord = {
            id,
            createdAt,
            ...input,
        };

        await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");

        return { filePath, record };
    }

    async list(): Promise<StoredReportEntry[]> {
        let filenames: string[];

        try {
            filenames = await readdir(this.directory);
        } catch {
            return [];
        }

        const entries: StoredReportEntry[] = [];

        for (const name of filenames) {
            if (!name.endsWith(".json")) {
                continue;
            }

            const filePath = join(this.directory, name);
            try {
                const raw = await readFile(filePath, "utf8");
                const parsed: unknown = JSON.parse(raw);
                if (isValidSavedReport(parsed)) {
                    entries.push({ filePath, record: parsed });
                }
            } catch {
                // Skip unreadable or non-LoadForge JSON files cleanly
            }
        }

        entries.sort((a, b) =>
            b.record.createdAt.localeCompare(a.record.createdAt)
        );

        return entries;
    }
}
