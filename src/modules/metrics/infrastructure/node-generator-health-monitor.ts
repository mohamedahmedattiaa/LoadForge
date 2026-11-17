import { monitorEventLoopDelay } from "perf_hooks";
import type {
    GeneratorHealthSnapshot,
    GeneratorHealthState,
    IGeneratorHealthMonitor,
} from "../domain/generator-health-port.js";

type EventLoopHistogram = ReturnType<typeof monitorEventLoopDelay>;

const EVENT_LOOP_RESOLUTION_MS = 10;
const SATURATED_EVENT_LOOP_P99_MS = 50;
const DEGRADED_EVENT_LOOP_P99_MS = 20;
const SATURATED_CPU_PERCENT = 92;
const DEGRADED_CPU_PERCENT = 80;

/**
 * Native Node.js generator health monitor.
 *
 * Tracks:
 * - Event loop delay using perf_hooks.monitorEventLoopDelay (C++ level timer delay).
 * - Process CPU utilization via process.cpuUsage().
 * - Process memory footprint (Heap Used and Resident Set Size).
 *
 * Implements SRE health classification:
 * - HEALTHY: Full confidence. Server capacity results are valid.
 * - DEGRADED: Warning level. Small generator jitter may be present.
 * - SATURATED: Critical. Results are bounded by the test machine, not the target server.
 */
export class NodeGeneratorHealthMonitor implements IGeneratorHealthMonitor {
    private histogram: EventLoopHistogram | null = null;
    private lastCpuUsage: NodeJS.CpuUsage | null = null;
    private lastCpuSampleTimeMs: number = 0;
    private cachedCpuPercent: number = 0;
    private running = false;

    constructor() {
        this.reset();
    }

    start(): void {
        if (this.running) {
            return;
        }

        if (!this.histogram) {
            this.histogram = monitorEventLoopDelay({
                resolution: EVENT_LOOP_RESOLUTION_MS,
            });
        }

        this.histogram.enable();
        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuSampleTimeMs = performance.now();
        this.running = true;
    }

    stop(): void {
        if (!this.running) {
            return;
        }

        if (this.histogram) {
            this.histogram.disable();
        }
        this.running = false;
    }

    reset(): void {
        this.stop();
        if (this.histogram) {
            this.histogram.reset();
        }
        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuSampleTimeMs = performance.now();
        this.cachedCpuPercent = 0;
    }

    private updateCpu(): number {
        const now = performance.now();
        if (!this.lastCpuUsage || this.lastCpuSampleTimeMs === 0) {
            this.lastCpuUsage = process.cpuUsage();
            this.lastCpuSampleTimeMs = now;
            return this.cachedCpuPercent;
        }

        const elapsedMs = Math.max(1, now - this.lastCpuSampleTimeMs);
        // Only re-sample CPU if at least 100ms has elapsed since last sample
        if (elapsedMs >= 100) {
            const currentUsage = process.cpuUsage(this.lastCpuUsage);
            const totalMicros = currentUsage.user + currentUsage.system;
            const totalCpuMs = totalMicros / 1000;

            this.cachedCpuPercent = Math.min(
                100,
                Math.max(0, (totalCpuMs / elapsedMs) * 100)
            );
            this.lastCpuUsage = process.cpuUsage();
            this.lastCpuSampleTimeMs = now;
        }

        return this.cachedCpuPercent;
    }

    getSnapshot(): GeneratorHealthSnapshot {
        this.updateCpu();

        // perf_hooks.monitorEventLoopDelay records in nanoseconds -> divide by 1e6 to get ms
        let eventLoopP50Ms = 0;
        let eventLoopP90Ms = 0;
        let eventLoopP95Ms = 0;
        let eventLoopP99Ms = 0;
        let eventLoopMaxMs = 0;

        if (this.histogram) {
            eventLoopP50Ms = this.histogram.percentile(50) / 1e6;
            eventLoopP90Ms = this.histogram.percentile(90) / 1e6;
            eventLoopP95Ms = this.histogram.percentile(95) / 1e6;
            eventLoopP99Ms = this.histogram.percentile(99) / 1e6;
            eventLoopMaxMs = Number(this.histogram.max) / 1e6;
        }

        const mem = process.memoryUsage();
        const heapUsedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
        const rssMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;

        let healthState: GeneratorHealthState = "HEALTHY";
        let warningMessage: string | undefined;

        if (
            eventLoopP99Ms > SATURATED_EVENT_LOOP_P99_MS ||
            this.cachedCpuPercent > SATURATED_CPU_PERCENT
        ) {
            healthState = "SATURATED";
            warningMessage = `Load generator is SATURATED (Event loop P99: ${eventLoopP99Ms.toFixed(1)}ms, CPU: ${this.cachedCpuPercent.toFixed(0)}%). Results may be bottlenecked by test machine.`;
        } else if (
            eventLoopP99Ms > DEGRADED_EVENT_LOOP_P99_MS ||
            this.cachedCpuPercent > DEGRADED_CPU_PERCENT
        ) {
            healthState = "DEGRADED";
            warningMessage = `Load generator experiencing moderate lag (Event loop P99: ${eventLoopP99Ms.toFixed(1)}ms, CPU: ${this.cachedCpuPercent.toFixed(0)}%).`;
        }

        return {
            eventLoopP50Ms,
            eventLoopP90Ms,
            eventLoopP95Ms,
            eventLoopP99Ms,
            eventLoopMaxMs,
            cpuPercent: Math.round(this.cachedCpuPercent * 10) / 10,
            heapUsedMb,
            rssMb,
            healthState,
            warningMessage,
        };
    }
}
