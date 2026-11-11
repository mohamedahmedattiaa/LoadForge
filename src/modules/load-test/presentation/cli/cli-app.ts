import { Command } from "commander";
import type { IReportFormatter } from "../../../metrics/domain/metrics-port.js";
import type { IRunLoadTestUseCase } from "../../application/load-test-port.js";
import { registerRunCommand } from "./commands/run-command.js";

export async function startCli(
    runLoadTestUseCase: IRunLoadTestUseCase,
    reportFormatter: IReportFormatter
): Promise<void> {
    const program = new Command();

    program
        .name("loadforge")
        .description("HTTP load testing CLI")
        .version("1.0.0")
        .showHelpAfterError();

    registerRunCommand(program, runLoadTestUseCase, reportFormatter);

    await program.parseAsync(process.argv);
}
