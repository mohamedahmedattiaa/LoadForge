import { describe, expect, it, vi } from "vitest";
import type { IDiscoverCapacityUseCase } from "../../src/modules/capacity/domain/capacity-port.js";
import type { IRunLoadTestUseCase } from "../../src/modules/load-test/application/load-test-port.js";
import type { LoadTestReport } from "../../src/modules/metrics/domain/metrics-types.js";
import type {
    IReportRepository,
    NewSavedReportInput,
    StoredReportEntry,
} from "../../src/modules/metrics/domain/report-repository-port.js";
import { RunTuiUseCase } from "../../src/modules/tui/application/run-tui-use-case.js";
import type {
    IPreferencesRepository,
    ITerminalDriver,
    KeyEventHandler,
    ResizeHandler,
} from "../../src/modules/tui/domain/tui-port.js";
import { createDefaultPreferences } from "../../src/modules/tui/domain/tui-state-service.js";
import type {
    TerminalSize,
    TuiKeyEvent,
    TuiPreferences,
} from "../../src/modules/tui/domain/tui-types.js";

class MockTerminalDriver implements ITerminalDriver {
    public frames: string[] = [];
    public entered = false;
    public exited = false;
    private keyHandlers = new Set<KeyEventHandler>();

    constructor(private readonly interactive = true) {}

    isInteractive(): boolean {
        return this.interactive;
    }

    getSize(): TerminalSize {
        return { columns: 100, rows: 32 };
    }

    enterAlternateScreen(): void {
        this.entered = true;
    }

    exitAlternateScreen(): void {
        this.exited = true;
    }

    writeFrame(frame: string): void {
        this.frames.push(frame);
    }

    onKey(handler: KeyEventHandler): () => void {
        this.keyHandlers.add(handler);
        return () => this.keyHandlers.delete(handler);
    }

    onResize(_handler: ResizeHandler): () => void {
        return () => {};
    }

    async readTextFile(): Promise<string> {
        return '{"from":"file"}';
    }

    async openInEditor(initialContent: string): Promise<string> {
        return initialContent;
    }

    send(key: TuiKeyEvent): void {
        for (const handler of this.keyHandlers) {
            handler(key);
        }
    }
}

async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("RunTuiUseCase (headless end-to-end navigation)", () => {
    it("refuses to enter alternate screen when stdout/stdin is non-interactive", async () => {
        const terminal = new MockTerminalDriver(false);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const app = new RunTuiUseCase({
            terminal,
            runLoadTestUseCase: { execute: vi.fn() },
            discoverCapacityUseCase: { execute: vi.fn() },
            reportRepository: {
                getReportsDirectory: () => "/tmp",
                save: vi.fn(),
                list: vi.fn(async () => []),
            },
            preferencesRepository: {
                getPreferencesPath: () => "/tmp/prefs.json",
                load: async () => createDefaultPreferences(),
                save: vi.fn(),
            },
        });

        await app.start();
        expect(terminal.entered).toBe(false);
        expect(errorSpy).toHaveBeenCalledOnce();
        errorSpy.mockRestore();
        process.exitCode = undefined;
    });

    it("drives Menu -> Configure Body -> Set Options -> Live Dashboard -> Saved Results -> History -> Exit", async () => {
        const terminal = new MockTerminalDriver(true);
        const savedEntries: StoredReportEntry[] = [];

        const sampleReport: LoadTestReport = {
            totalRequests: 100,
            successfulRequests: 100,
            failedRequests: 0,
            httpErrors: 0,
            networkErrors: 0,
            timeouts: 0,
            durationMs: 420,
            requestsPerSecond: 238.1,
            statusCodes: { "200": 100 },
            latency: {
                min: 4,
                max: 21,
                average: 8.5,
                p50: 8,
                p90: 14,
                p95: 17,
                p99: 20,
            },
        };

        const runLoadTestMock = vi.fn<IRunLoadTestUseCase["execute"]>(
            async (_config, options) => {
                options?.onProgress?.({
                    phase: "running",
                    elapsedMs: 120,
                    targetRequests: 100,
                    totalRequests: 50,
                    successfulRequests: 50,
                    failedRequests: 0,
                    instantRps: 250,
                    avgLatencyMs: 8,
                    p95LatencyMs: 15,
                    errorRate: 0,
                    currentConcurrency: 10,
                    resolvedTimeoutMs: 2000,
                });
                return sampleReport;
            }
        );

        const discoverMock: IDiscoverCapacityUseCase = { execute: vi.fn() };

        const reportRepo: IReportRepository = {
            getReportsDirectory: () => "/tmp/reports",
            save: async (input: NewSavedReportInput) => {
                const entry: StoredReportEntry = {
                    filePath: `/tmp/reports/report-${savedEntries.length + 1}.json`,
                    record: {
                        id: `id-${savedEntries.length + 1}`,
                        createdAt: new Date().toISOString(),
                        ...input,
                    } as StoredReportEntry["record"],
                };
                savedEntries.unshift(entry);
                return entry;
            },
            list: async () => savedEntries,
        };

        let storedPrefs: TuiPreferences = createDefaultPreferences();
        const prefsRepo: IPreferencesRepository = {
            getPreferencesPath: () => "/tmp/prefs.json",
            load: async () => storedPrefs,
            save: async (next) => {
                storedPrefs = next;
            },
        };

        const app = new RunTuiUseCase({
            terminal,
            runLoadTestUseCase: { execute: runLoadTestMock },
            discoverCapacityUseCase: discoverMock,
            reportRepository: reportRepo,
            preferencesRepository: prefsRepo,
        });

        const appPromise = app.start();
        await flushMicrotasks();

        // 0. Main menu tab switching via Right / '?' / Left
        terminal.send({ name: "right" });
        await flushMicrotasks();
        const helpTabFrame = (terminal.frames.at(-1) ?? "").replace(/\x1b\[[0-9;]*m/g, "");
        expect(helpTabFrame).toContain("Keyboard Shortcuts & Modes");

        terminal.send({ name: "right" });
        await flushMicrotasks();
        const startTabFrame = (terminal.frames.at(-1) ?? "").replace(/\x1b\[[0-9;]*m/g, "");
        expect(startTabFrame).toContain("Quick Start Workflow");

        terminal.send({ name: "char", char: "?" });
        await flushMicrotasks();
        const questionHelpFrame = (terminal.frames.at(-1) ?? "").replace(/\x1b\[[0-9;]*m/g, "");
        expect(questionHelpFrame).toContain("Keyboard Shortcuts & Modes");

        terminal.send({ name: "left" });
        await flushMicrotasks();
        const detailsTabFrame = (terminal.frames.at(-1) ?? "").replace(/\x1b\[[0-9;]*m/g, "");
        expect(detailsTabFrame).toContain("HTTP Load Benchmark");

        // 1. Main menu -> Enter "Start a new load test" -> goes directly to Configure / Load Test (Set Options)
        terminal.send({ name: "enter" });
        await flushMicrotasks();
        const configureFrame = (terminal.frames.at(-1) ?? "").replace(/\x1b\[[0-9;]*m/g, "");
        expect(configureFrame).toContain("Configure / Load Test");

        // Replace pristine placeholder URL by typing directly, switch Method GET -> POST, launch immediately with Ctrl+R
        for (const ch of "https://localhost:3000/items") {
            terminal.send({ name: "char", char: ch });
        }
        terminal.send({ name: "down" }); // Method field
        terminal.send({ name: "right" }); // GET -> POST
        terminal.send({ name: "ctrl-r" }); // Start Test
        await flushMicrotasks();

        expect(runLoadTestMock).toHaveBeenCalledOnce();
        expect(runLoadTestMock.mock.calls[0][0].url).toBe("https://localhost:3000/items");
        expect(runLoadTestMock.mock.calls[0][0].method).toBe("POST");
        expect(savedEntries).toHaveLength(1);
        expect(terminal.frames.at(-1)).toContain("Load Test Report");

        // 3. Return to Main Menu -> hotkey '3' opens Previous Reports
        terminal.send({ name: "enter" });
        await flushMicrotasks();
        terminal.send({ name: "char", char: "3" });
        await flushMicrotasks();
        expect(terminal.frames.at(-1)).toContain("Previous Reports");

        // Escape back to main menu -> 'q' to Exit
        terminal.send({ name: "escape" });
        await flushMicrotasks();
        terminal.send({ name: "char", char: "q" });

        await appPromise;
        expect(terminal.entered).toBe(true);
        expect(terminal.exited).toBe(true);
    });
});
