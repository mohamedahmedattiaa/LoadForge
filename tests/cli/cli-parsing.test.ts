
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { Command } from "commander";

import { registerRunCommand } from "../../src/cli/commands/run-command.js";
import type { LoadTestService } from "../../src/modules/load-test/load-test.service.js";

describe("CLI argument parsing", () => {
    let runMock: ReturnType<typeof vi.fn>;
    let loadTestService: LoadTestService;

    beforeEach(() => {
        runMock = vi.fn();

        loadTestService = {
            run: runMock,
        } as unknown as LoadTestService;
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

        registerRunCommand(program, loadTestService);

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
