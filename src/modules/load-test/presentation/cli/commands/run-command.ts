import { Command } from "commander";
import type { IReportFormatter } from "../../../../metrics/domain/metrics-port.js";
import type { IRunLoadTestUseCase } from "../../../application/load-test-port.js";
import {
    buildLoadTestConfig,
    type RunCommandOptions,
} from "../config/cli-config-mapper.js";

export function registerRunCommand(
    program: Command,
    runLoadTestUseCase: IRunLoadTestUseCase,
    reportFormatter: IReportFormatter
): void {
    program
        .command("run")
        .description("Run an HTTP load test")
        .requiredOption("-u, --url <url>", "Target URL")
        .option("-m, --method <method>", "HTTP method")
        .option("-r, --requests <number>", "Total number of requests")
        .option("-d, --duration <seconds>", "Test duration in seconds")
        .option(
            "-c, --concurrency <number|auto>",
            "Number of concurrent workers (default: auto)"
        )
        .option(
            "-t, --timeout <milliseconds|auto>",
            "Request timeout in ms (default: auto)"
        )
        .option("--queue-capacity <number>", "Maximum pending requests")
        .action(async (options: RunCommandOptions) => {
            try {
                const config = buildLoadTestConfig(options);

                const report = await runLoadTestUseCase.execute(config);

                console.log(reportFormatter.format(report));
            } catch (error: unknown) {
                process.exitCode = 1;
                if (error instanceof Error) {
                    console.error(`LoadForge failed: ${error.message}`);
                    return;
                }

                console.error("LoadForge failed with an unknown error.");
            }
        });
}
