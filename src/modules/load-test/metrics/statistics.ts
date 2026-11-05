
export interface LatencyStatistics {
    min: number | null;
    max: number | null;
    average: number | null;
    p50: number | null;
    p90: number | null;
    p95: number | null;
    p99: number | null;
}

function calculatePercentile(
    sortedLatencies: readonly number[],
    percentile: number
): number {
    const rank = Math.ceil(percentile * sortedLatencies.length);

    return sortedLatencies[rank - 1];
}

export function calculateLatencyStatistics(
    latencies: readonly number[]
): LatencyStatistics {
    if (latencies.length === 0) {
        return {
            min: null,
            max: null,
            average: null,
            p50: null,
            p90: null,
            p95: null,
            p99: null,
        };
    }

    const sortedLatencies = [...latencies].sort(
        (a, b) => a - b
    );

    const totalLatency = latencies.reduce(
        (total, latency) => total + latency,
        0
    );

    return {
        min: sortedLatencies[0],
        max: sortedLatencies[sortedLatencies.length - 1],
        average: totalLatency / latencies.length,

        p50: calculatePercentile(sortedLatencies, 0.50),
        p90: calculatePercentile(sortedLatencies, 0.90),
        p95: calculatePercentile(sortedLatencies, 0.95),
        p99: calculatePercentile(sortedLatencies, 0.99),
    };
}
