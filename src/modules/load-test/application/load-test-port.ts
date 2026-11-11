import type { LoadTestReport } from "../../metrics/domain/metrics-types.js";
import type { LoadTestConfig } from "../domain/load-test-types.js";

export interface IRunLoadTestUseCase {
    execute(config: LoadTestConfig): Promise<LoadTestReport>;
}
