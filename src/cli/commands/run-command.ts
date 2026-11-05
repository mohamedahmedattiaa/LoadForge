
import { Command } from "commander";

import { LoadTestService } from "../../modules/load-test/load-test.service.js";

import {
    buildLoadTestConfig,
    type RunCommandOptions,
} from "../config/config-builder.js";

import { formatReport } from "../output/report-formatter.js";

export function registerRunCommand(
    program: Command,
    loadTestService: LoadTestService
): void {
    program
        .command("run")
        .description("Run an HTTP load test")
        .requiredOption("-u, --url <url>", "Target URL")
        .option("-m, --method <method>", "HTTP method")
        .option("-r, --requests <number>", "Total number of requests")
        .option("-d, --duration <seconds>", "Test duration in seconds")
        .option("-c, --concurrency <number>", "Number of concurrent workers")
        .option("-t, --timeout <milliseconds>", "Request timeout")
        .option("--queue-capacity <number>", "Maximum pending requests")
        .action(async (options: RunCommandOptions) => {
            try {
                const config = buildLoadTestConfig(options);

                const report = await loadTestService.run(config);

                console.log(formatReport(report));
            } catch (error: unknown) {
                process.exitCode = 1 
                if (error instanceof Error) {
                    console.error(`LoadForge failed: ${error.message}`);
                    return;
                }

                console.error("LoadForge failed with an unknown error.");
            }
        });
}
