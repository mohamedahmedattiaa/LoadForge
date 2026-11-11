import { Command } from "commander";
import type {
    ICapacityReportFormatter,
    IDiscoverCapacityUseCase,
} from "../../domain/capacity-port.js";
import {
    buildCapacityDiscoveryConfig,
    type DiscoverCommandOptions,
} from "./capacity-cli-mapper.js";

export function registerDiscoverCommand(
    program: Command,
    discoverCapacityUseCase: IDiscoverCapacityUseCase,
    capacityFormatter: ICapacityReportFormatter
): void {
    program
        .command("discover")
        .description(
            "Automatically escalate load in timed steps until max capacity or server saturation"
        )
        .requiredOption("-u, --url <url>", "Target URL")
        .option("-m, --method <method>", "HTTP method (default: GET)")
        .option(
            "--mode <sustained|burst>",
            "Discovery mode: sustained (loop over window) or burst (fire N users all at once per window)"
        )
        .option(
            "-w, --window <seconds>",
            "Step window / burst budget in seconds, e.g. 1 or 5 (default: 2)"
        )
        .option(
            "--start-concurrency <number>",
            "Starting number of concurrent users (default: 5)"
        )
        .option(
            "--max-concurrency <number>",
            "Maximum concurrent users ceiling (default: 500)"
        )
        .option(
            "--step-multiplier <number>",
            "Escalation factor between steps (default: 2)"
        )
        .option(
            "--until-limit",
            "Keep scaling past latency/plateau slowdowns until HTTP 429, errors, or timeouts occur"
        )
        .option(
            "--max-error-rate <ratio>",
            "Max tolerable failure ratio 0..1 before stopping (default: 0.02)"
        )
        .option(
            "--max-p95 <milliseconds>",
            "Optional p95 latency SLO threshold in ms"
        )
        .option(
            "--no-stop-on-rate-limit",
            "Do not stop immediately when HTTP 429 is returned"
        )
        .option(
            "-t, --timeout <milliseconds|auto>",
            "Request timeout in ms (default: auto)"
        )
        .option("--queue-capacity <number>", "Maximum pending requests")
        .action(async (options: DiscoverCommandOptions) => {
            try {
                const config = buildCapacityDiscoveryConfig(options);
                const policyLabel =
                    config.stopPolicy === "rejection" ? "until-limit" : "slo";

                console.log(
                    `Starting capacity discovery on ${config.method} ${config.url} (mode: ${config.mode}, window: ${config.stepDurationSeconds}s, policy: ${policyLabel})...`
                );

                const report = await discoverCapacityUseCase.execute(
                    config,
                    (step) => {
                        console.log(capacityFormatter.formatStepProgress(step));
                    }
                );

                console.log(capacityFormatter.format(report));
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
