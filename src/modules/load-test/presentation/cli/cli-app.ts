import { Command } from "commander";
import type { AppContainer } from "../../../../container.js";
import { registerDiscoverCommand } from "../../../capacity/presentation/cli/discover-command.js";
import { registerRunCommand } from "./commands/run-command.js";

export async function startCli(container: AppContainer): Promise<void> {
    if (process.argv.length <= 2) {
        await container.tuiApp.start();
        return;
    }

    const program = new Command();

    program
        .name("loadforge")
        .description("HTTP load testing CLI")
        .version("1.0.0")
        .showHelpAfterError();

    registerRunCommand(
        program,
        container.runLoadTestUseCase,
        container.reportFormatter
    );
    registerDiscoverCommand(
        program,
        container.discoverCapacityUseCase,
        container.capacityFormatter
    );

    program
        .command("tui")
        .description("Launch interactive terminal dashboard")
        .action(async () => {
            await container.tuiApp.start();
        });

    await program.parseAsync(process.argv);
}
