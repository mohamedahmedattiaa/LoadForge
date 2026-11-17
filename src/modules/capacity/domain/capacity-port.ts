import type { LoadTestLiveSnapshot } from "../../load-test/application/load-test-port.js";
import type {
    CapacityDiscoveryConfig,
    CapacityReport,
    CapacityStepResult,
} from "./capacity-types.js";

export type CapacityStepCallback = (step: CapacityStepResult) => void;
export type CapacityLiveCallback = (snapshot: LoadTestLiveSnapshot) => void;

export interface IDiscoverCapacityUseCase {
    execute(
        config: CapacityDiscoveryConfig,
        onStepComplete?: CapacityStepCallback,
        signal?: AbortSignal,
        onLiveProgress?: CapacityLiveCallback
    ): Promise<CapacityReport>;
}

export interface ICapacityReportFormatter {
    formatStepProgress(step: CapacityStepResult): string;
    format(report: CapacityReport): string;
}
