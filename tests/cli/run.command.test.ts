
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

import { registerRunCommand } from "../../src/modules/load-test/presentation/cli/commands/run-command.js";
import type { IRunLoadTestUseCase } from "../../src/modules/load-test/application/load-test-port.js";
import type { LoadTestReport } from "../../src/modules/metrics/domain/metrics-types.js";
import { ConsoleReportFormatter } from "../../src/modules/metrics/presentation/console-report-formatter.js";

describe("registerRunCommand", () => {
    let runLoadTestUseCase: IRunLoadTestUseCase;
    let runMock: ReturnType<typeof vi.fn>;

    const report: LoadTestReport = {
        totalRequests: 10,
        successfulRequests: 10,
        failedRequests: 0,
        httpErrors: 0,
        networkErrors: 0,
        timeouts: 0,
        durationMs: 1000,
        requestsPerSecond: 10,
        statusCodes: {
            "200": 10,
        },
        latency: {
            min: 10,
            max: 100,
            average: 50,
            p50: 50,
            p90: 90,
            p95: 95,
            p99: 99,
        },
    };

    beforeEach(() => {
        runMock = vi.fn();

        runLoadTestUseCase = {
            execute: runMock,
        };

        process.exitCode = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.exitCode = undefined;
    });

    function createProgram(): Command {
        const program = new Command();

        registerRunCommand(
            program,
            runLoadTestUseCase,
            new ConsoleReportFormatter()
        );

        return program;
    }

    it("should execute the load test and print the report", async () => {
        runMock.mockResolvedValue(report);

        const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

        const program = createProgram();

        await program.parseAsync([
            "node",
            "loadforge",
            "run",
            "--url",
            "https://example.com",
            "--requests",
            "10",
        ]);

        expect(runMock).toHaveBeenCalledOnce();
        expect(runMock).toHaveBeenCalledWith(
            expect.objectContaining({
                url: "https://example.com",
                requests: 10,
            })
        );

        expect(logSpy).toHaveBeenCalledOnce();
        expect(logSpy.mock.calls[0][0]).toContain("LOADFORGE REPORT");

        expect(process.exitCode).toBeUndefined();
    });

    it("should handle normal errors and set exit code to 1", async () => {
        runMock.mockRejectedValue(new Error("Connection refused"));

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const program = createProgram();

        await program.parseAsync([
            "node",
            "loadforge",
            "run",
            "--url",
            "https://example.com",
            "--requests",
            "10",
        ]);

        expect(errorSpy).toHaveBeenCalledWith(
            "LoadForge failed: Connection refused"
        );

        expect(process.exitCode).toBe(1);
    });

    it("should handle unknown errors and set exit code to 1", async () => {
        runMock.mockRejectedValue("Something unexpected");

        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const program = createProgram();

        await program.parseAsync([
            "node",
            "loadforge",
            "run",
            "--url",
            "https://example.com",
            "--requests",
            "10",
        ]);

        expect(errorSpy).toHaveBeenCalledWith(
            "LoadForge failed with an unknown error."
        );

        expect(process.exitCode).toBe(1);
    });
});
