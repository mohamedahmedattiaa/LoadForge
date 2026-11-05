import { Command } from "commander";
import { LoadTestService } from "../modules/load-test/load-test.service.js";
import { registerRunCommand } from "./commands/run-command.js";

export async function startCli(
    loadTestService: LoadTestService
): Promise<void> {
    const program = new Command();

    // Application configuration
    program
        .name("loadforge")
        .description("HTTP load testing CLI")
        .version("1.0.0")
        .showHelpAfterError();

    // Run command
     registerRunCommand(program, loadTestService);

    // Parse command-line arguments
    await program.parseAsync(process.argv);
}