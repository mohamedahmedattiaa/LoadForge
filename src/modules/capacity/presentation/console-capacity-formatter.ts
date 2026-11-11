import type { ICapacityReportFormatter } from "../domain/capacity-port.js";
import type {
    CapacityReport,
    CapacityStepResult,
} from "../domain/capacity-types.js";

function formatLatency(value: number | null): string {
    return value === null ? "N/A" : `${value.toFixed(1)} ms`;
}

function formatVerdictBadge(step: CapacityStepResult): string {
    return step.verdict.toUpperCase();
}

function formatFailureBreakdown(step: CapacityStepResult): string {
    if (step.failedRequests === 0) {
        return "";
    }

    const parts: string[] = [];
    if (step.rateLimitedCount > 0) parts.push(`429=${step.rateLimitedCount}`);
    if (step.http5xxCount > 0) parts.push(`5xx=${step.http5xxCount}`);
    if (step.timeoutCount > 0) parts.push(`to=${step.timeoutCount}`);
    if (step.networkErrorCount > 0) parts.push(`net=${step.networkErrorCount}`);

    const accounted =
        step.rateLimitedCount +
        step.http5xxCount +
        step.timeoutCount +
        step.networkErrorCount;
    const otherHttp = step.failedRequests - accounted;
    if (otherHttp > 0) parts.push(`4xx=${otherHttp}`);

    return parts.length > 0 ? ` [${parts.join(" ")}]` : "";
}

export class ConsoleCapacityFormatter implements ICapacityReportFormatter {
    formatStepProgress(step: CapacityStepResult): string {
        const errPct = (step.errorRate * 100).toFixed(1);
        const badge = formatVerdictBadge(step);
        const failureDetail = formatFailureBreakdown(step);
        const base =
            `[Step ${step.stepNumber}] users=${String(step.concurrency).padEnd(4)} | ` +
            `ok=${step.successfulRequests}/${step.totalRequests} in ${step.durationSeconds.toFixed(2)}s | ` +
            `goodput=${step.goodputRps.toFixed(1)} req/s | ` +
            `p95=${formatLatency(step.p95LatencyMs)} | ` +
            `err=${errPct}%${failureDetail} | ${badge}`;

        return step.reason ? `${base} (${step.reason})` : base;
    }

    format(report: CapacityReport): string {
        const lines: string[] = [];

        lines.push("");
        lines.push("========================================");
        lines.push("      LOADFORGE CAPACITY REPORT");
        lines.push("========================================");

        lines.push("");
        lines.push("EXECUTIVE SUMMARY");
        lines.push(report.summary);

        lines.push("");
        lines.push("CAPACITY METRICS");
        lines.push(`Target:             ${report.method} ${report.url}`);
        lines.push(`Mode:               ${report.mode}`);
        lines.push(
            `Step Window:        ${report.stepDurationSeconds} seconds`
        );
        lines.push(
            `Stop Policy:        ${
                report.stopPolicy === "rejection" ? "until-limit" : "slo"
            }`
        );
        lines.push(`Resolved Timeout:   ${report.resolvedTimeoutMs} ms`);
        if (report.baselineMinRttMs !== null) {
            lines.push(
                `Baseline Min RTT:   ${report.baselineMinRttMs.toFixed(2)} ms`
            );
        }
        if (report.baselineP95Ms !== null) {
            lines.push(
                `Baseline P95:       ${report.baselineP95Ms.toFixed(2)} ms`
            );
        }
        const safeUnit =
            report.mode === "burst"
                ? `burst in ${report.stepDurationSeconds}s`
                : "concurrent";
        lines.push(
            `Max Safe Users:     ${report.maxSafeConcurrency} ${safeUnit}`
        );
        lines.push(
            `Max Users / sec:    ${report.maxSafeRps.toFixed(1)} req/s (Peak Safe RPS)`
        );
        lines.push(
            `Breaking Point:     ${
                report.breakingConcurrency === null
                    ? "Not reached"
                    : `${report.breakingConcurrency} ${safeUnit}`
            }`
        );
        lines.push(
            `Recommended Load:   ${report.recommendedConcurrency} ${safeUnit} (20% headroom)`
        );
        lines.push(`Stop Reason:        ${report.stopReason}`);

        lines.push("");
        lines.push("STEP HISTORY");

        for (const step of report.steps) {
            lines.push(this.formatStepProgress(step));
        }

        lines.push("========================================");

        return lines.join("\n");
    }
}
