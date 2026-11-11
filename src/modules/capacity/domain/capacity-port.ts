import type {
    CapacityDiscoveryConfig,
    CapacityReport,
    CapacityStepResult,
} from "./capacity-types.js";

export type CapacityStepCallback = (step: CapacityStepResult) => void;

export interface IDiscoverCapacityUseCase {
    execute(
        config: CapacityDiscoveryConfig,
        onStepComplete?: CapacityStepCallback
    ): Promise<CapacityReport>;
}

export interface ICapacityReportFormatter {
    formatStepProgress(step: CapacityStepResult): string;
    format(report: CapacityReport): string;
}
