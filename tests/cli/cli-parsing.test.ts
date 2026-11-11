
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { Command } from "commander";

import { registerRunCommand } from "../../src/modules/load-test/presentation/cli/commands/run-command.js";
import type { IRunLoadTestUseCase } from "../../src/modules/load-test/application/load-test-port.js";
import { ConsoleReportFormatter } from "../../src/modules/metrics/presentation/console-report-formatter.js";

describe("CLI argument parsing", () => {
    let runMock: ReturnType<typeof vi.fn>;
    let runLoadTestUseCase: IRunLoadTestUseCase;

    beforeEach(() => {
        runMock = vi.fn();

        runLoadTestUseCase = {
            execute: runMock,
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function createProgram(): Command {
        const program = new Command();

        program
            .name("loadforge")
            .exitOverride()
            .configureOutput({
                writeOut: vi.fn(),
                writeErr: vi.fn(),
            });

        registerRunCommand(
            program,
            runLoadTestUseCase,
            new ConsoleReportFormatter()
        );

        return program;
    }

    it("should reject when the required URL option is missing", async () => {
        const program = createProgram();

        await expect(
            program.parseAsync([
                "node",
                "loadforge",
                "run",
                "--requests",
                "10",
            ])
        ).rejects.toMatchObject({
            code: "commander.missingMandatoryOptionValue",
        });

        expect(runMock).not.toHaveBeenCalled();
    });

    it("should reject unknown CLI options", async () => {
        const program = createProgram();

        await expect(
            program.parseAsync([
                "node",
                "loadforge",
                "run",
                "--url",
                "https://example.com",
                "--requests",
                "10",
                "--invalid-option",
            ])
        ).rejects.toMatchObject({
            code: "commander.unknownOption",
        });

        expect(runMock).not.toHaveBeenCalled();
    });

    it("should reject when the URL option has no value", async () => {
        const program = createProgram();

        await expect(
            program.parseAsync([
                "node",
                "loadforge",
                "run",
                "--url",
            ])
        ).rejects.toMatchObject({
            code: "commander.optionMissingArgument",
        });

        expect(runMock).not.toHaveBeenCalled();
    });
});
