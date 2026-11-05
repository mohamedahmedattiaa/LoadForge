
import { describe, it, expect } from "vitest";

import {
    formatReport,
} from "../../src/cli/output/report-formatter.js";

import type {
    LoadTestReport,
} from "../../src/modules/load-test/metrics/report-builder.js";

function createReport(
    overrides: Partial<LoadTestReport> = {}
): LoadTestReport {
    return {
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        httpErrors: 3,
        networkErrors: 1,
        timeouts: 1,
        durationMs: 10000,
        requestsPerSecond: 10,
        statusCodes: {
            "200": 95,
            "500": 3,
        },
        latency: {
            min: 10,
            max: 100,
            average: 40,
            p50: 30,
            p90: 70,
            p95: 90,
            p99: 100,
        },
        ...overrides,
    };
}

describe("formatReport", () => {
    it("should format a normal load test report", () => {
        const report = createReport();

        const output = formatReport(report);

        expect(output).toContain("LOADFORGE REPORT");
        expect(output).toContain("TEST SUMMARY");
        expect(output).toContain("Duration:           10.00 seconds");

        expect(output).toContain("Total Requests:     100");
        expect(output).toContain("Successful:         95");
        expect(output).toContain("Failed:             5");

        expect(output).toContain("HTTP Errors:        3");
        expect(output).toContain("Network Errors:     1");
        expect(output).toContain("Timeouts:           1");

        expect(output).toContain("Requests/sec:       10.00 req/s");
        expect(output).toContain("Average Latency:    40.00 ms");
        expect(output).toContain("Min Latency:        10.00 ms");
        expect(output).toContain("Max Latency:        100.00 ms");

        expect(output).toContain("P50:");
        expect(output).toContain("P90:");
        expect(output).toContain("P95:");
        expect(output).toContain("P99:");

        expect(output).toContain("200:                95");
        expect(output).toContain("500:                3");
    });

    it("should display N/A for null latency values", () => {
        const report = createReport({
            latency: {
                min: null,
                max: null,
                average: null,
                p50: null,
                p90: null,
                p95: null,
                p99: null,
            },
        });

        const output = formatReport(report);

        expect(output).toContain("Average Latency:    N/A");
        expect(output).toContain("Min Latency:        N/A");
        expect(output).toContain("Max Latency:        N/A");
        expect(output).toContain("P50:                N/A");
        expect(output).toContain("P90:                N/A");
        expect(output).toContain("P95:                N/A");
        expect(output).toContain("P99:                N/A");
    });

    it("should display a message when no HTTP status codes exist", () => {
        const report = createReport({
            statusCodes: {},
        });

        const output = formatReport(report);

        expect(output).toContain("HTTP STATUS CODES");
        expect(output).toContain("No HTTP responses recorded.");
    });

    it("should handle a zero-duration report", () => {
        const report = createReport({
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            httpErrors: 0,
            networkErrors: 0,
            timeouts: 0,
            durationMs: 0,
            requestsPerSecond: null,
            statusCodes: {},
            latency: {
                min: null,
                max: null,
                average: null,
                p50: null,
                p90: null,
                p95: null,
                p99: null,
            },
        });

        const output = formatReport(report);

        expect(output).toContain("Duration:           0.00 seconds");
        expect(output).toContain("Requests/sec:       N/A");
        expect(output).toContain("Total Requests:     0");
        expect(output).toContain("Average Latency:    N/A");
        expect(output).toContain("No HTTP responses recorded.");
    });

    it("should use actual newline characters instead of literal /n", () => {
        const report = createReport();

        const output = formatReport(report);

        expect(output).toContain("\n");
        expect(output).not.toContain("/n");
        expect(output.split("\n").length).toBeGreaterThan(10);
    });
});
