import type { IReportFormatter } from "../domain/metrics-port.js";
import type { LoadTestReport } from "../domain/metrics-types.js";

export class ConsoleReportFormatter implements IReportFormatter {
    format(report: LoadTestReport): string {
        const lines: string[] = [];

        const formatValue = (value: number | null): string => {
            return value === null ? "N/A" : `${value.toFixed(2)} ms`;
        };

        const formatRate = (value: number | null): string => {
            return value === null ? "N/A" : `${value.toFixed(2)} req/s`;
        };

        lines.push("========================================");
        lines.push("             LOADFORGE REPORT");
        lines.push("========================================");

        lines.push("");
        lines.push("TEST SUMMARY");
        lines.push(
            `Duration:           ${(report.durationMs / 1000).toFixed(2)} seconds`
        );

        if (report.adaptive !== undefined) {
            const { adaptive } = report;
            lines.push(
                `Timeout:            ${adaptive.resolvedTimeoutMs} ms (${adaptive.timeoutMode})`
            );
            if (adaptive.concurrencyMode === "auto") {
                lines.push(
                    `Concurrency:        auto (start: ${adaptive.initialConcurrency}, peak: ${adaptive.peakConcurrency}, final: ${adaptive.finalConcurrency})`
                );
            } else {
                lines.push(
                    `Concurrency:        ${adaptive.finalConcurrency} (fixed)`
                );
            }
            if (adaptive.baselineMinRttMs !== null) {
                lines.push(
                    `Baseline Min RTT:   ${adaptive.baselineMinRttMs.toFixed(2)} ms`
                );
            }
        }

        lines.push("");
        lines.push("REQUEST RESULTS");
        lines.push(`Total Requests:     ${report.totalRequests}`);
        lines.push(`Successful:         ${report.successfulRequests}`);
        lines.push(`Failed:             ${report.failedRequests}`);
        lines.push(`HTTP Errors:        ${report.httpErrors}`);
        lines.push(`Network Errors:     ${report.networkErrors}`);
        lines.push(`Timeouts:           ${report.timeouts}`);

        lines.push("");
        lines.push("PERFORMANCE");
        lines.push(`Requests/sec:       ${formatRate(report.requestsPerSecond)}`);
        lines.push(`Average Latency:    ${formatValue(report.latency.average)}`);
        lines.push(`Min Latency:        ${formatValue(report.latency.min)}`);
        lines.push(`Max Latency:        ${formatValue(report.latency.max)}`);
        lines.push(`P50:                ${formatValue(report.latency.p50)}`);
        lines.push(`P90:                ${formatValue(report.latency.p90)}`);
        lines.push(`P95:                ${formatValue(report.latency.p95)}`);
        lines.push(`P99:                ${formatValue(report.latency.p99)}`);

        lines.push("");
        lines.push("HTTP STATUS CODES");

        const statusCodes = Object.entries(report.statusCodes);

        if (statusCodes.length === 0) {
            lines.push("No HTTP responses recorded.");
        } else {
            for (const [statusCode, count] of statusCodes) {
                lines.push(`${statusCode}:                ${count}`);
            }
        }

        lines.push("========================================");

        return lines.join("\n");
    }
}
