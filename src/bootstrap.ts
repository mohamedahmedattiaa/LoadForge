import { createAppContainer } from "./container.js";
import { startCli } from "./modules/load-test/presentation/cli/cli-app.js";

export async function bootstrap(): Promise<void> {
    const container = createAppContainer();
    await startCli(container.runLoadTestUseCase, container.reportFormatter);
}
