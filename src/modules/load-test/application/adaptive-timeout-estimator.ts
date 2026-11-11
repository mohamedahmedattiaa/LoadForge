import type { HttpRequest } from "../../http/domain/http-types.js";
import type { ITransportClient } from "../../http/domain/transport-port.js";
import {
    calculateAdaptiveTimeout,
    DEFAULT_ADAPTIVE_TIMEOUT_OPTIONS,
} from "../domain/adaptive-timeout-math.js";
import type {
    AdaptiveTimeoutOptions,
    ITimeoutEstimator,
    TimeoutEstimationResult,
} from "../domain/timeout-estimator-port.js";

export class AdaptiveTimeoutEstimator implements ITimeoutEstimator {
    private readonly options: Required<AdaptiveTimeoutOptions>;

    constructor(
        private readonly transport: ITransportClient,
        options: AdaptiveTimeoutOptions = {}
    ) {
        this.options = { ...DEFAULT_ADAPTIVE_TIMEOUT_OPTIONS, ...options };
    }

    async estimate(
        baseRequest: Omit<HttpRequest, "timeout">
    ): Promise<TimeoutEstimationResult> {
        const probeRequest: HttpRequest = {
            ...baseRequest,
            timeout: this.options.probeTimeoutMs,
        };

        const rttSamples: number[] = [];
        let probesFailed = 0;

        for (let i = 0; i < this.options.probeCount; i++) {
            try {
                const response = await this.transport.send(probeRequest);
                rttSamples.push(response.duration);
            } catch {
                probesFailed++;
            }
        }

        return calculateAdaptiveTimeout(
            rttSamples,
            this.options.probeCount,
            probesFailed,
            this.options
        );
    }
}
