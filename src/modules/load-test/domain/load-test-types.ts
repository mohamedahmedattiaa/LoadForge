import type { HttpMethod } from "../../http/domain/http-types.js";

export interface LoadTestConfig {
    url: string;
    method: HttpMethod;
    requests?: number;
    duration?: number;
    concurrency: number | "auto";
    timeout: number | "auto";
    queueCapacity: number;
}
