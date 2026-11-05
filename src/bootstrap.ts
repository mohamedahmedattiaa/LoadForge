import { startCli } from "./cli/index.js";
import { HttpClient } from "./modules/http/http-client.js";
import { LoadTestService } from "./modules/load-test/load-test.service.js";

export async function bootstrap():Promise<void> {
    // 1 - Create httpClient
    const client = new HttpClient()
    // 2 - Create LoadTestService
    const loadService = new LoadTestService(client)
    // 3 - Start CLI
    await startCli(loadService)
}

