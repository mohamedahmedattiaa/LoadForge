import type { CapacityReport } from "../../../capacity/domain/capacity-types.js";
import type { LoadTestReport } from "../../../metrics/domain/metrics-types.js";
import type { TerminalSize, TuiAppState } from "../../domain/tui-types.js";
import {
    composeFullScreen,
    getFullScreenDimensions,
    renderBottomBar,
    renderBox,
    renderHorizontalBoxes,
    renderMiniBrailleCurve,
    renderSplitColumns,
    renderTopBar,
    wrapPlainText,
} from "../components/tui-primitives.js";
import { padRightVisible, theme, visibleLength } from "../theme/ansi-palette.js";

function formatLatency(value: number | null): string {
    return value === null ? "--" : `${value.toFixed(2)} ms`;
}

function formatDuration(ms: number): string {
    const secs = ms / 1000;
    if (secs < 60) {
        return `${secs.toFixed(2)} seconds`;
    }
    const mins = Math.floor(secs / 60);
    const rem = Math.round(secs % 60);
    return `${mins}m ${rem}s`;
}

function formatCapacityUnit(report: CapacityReport): string {
    if (report.mode === "burst") {
        return report.stepDurationSeconds === 1
            ? "users/sec"
            : `users/${report.stepDurationSeconds}s`;
    }
    return "concurrent";
}

function renderLatencyBarRow(
    label: string,
    value: number | null,
    maxValue: number,
    barWidth: number,
    colorFn: (s: string) => string
): string {
    const tag = theme.muted(label.padEnd(4));
    const valStr = (value === null ? "--" : `${value.toFixed(2)} ms`).padStart(10);
    const ratio = value !== null && maxValue > 0 ? Math.min(1, value / maxValue) : 0;
    const filled = value !== null ? Math.max(1, Math.round(ratio * barWidth)) : 0;
    const empty = Math.max(0, barWidth - filled);
    const bar = `${colorFn("▇".repeat(filled))}${theme.border("─".repeat(empty))}`;
    return `  ${tag} ${theme.whiteBold(valStr)}  ${bar}`;
}

function renderLoadTestReportBody(
    report: LoadTestReport,
    filePath: string | null,
    aborted: boolean,
    width: number,
    remainingRows: number
): string[] {
    const total = report.totalRequests;
    const okPct =
        total > 0 ? Math.round((report.successfulRequests / total) * 100) : 0;
    const errPct =
        total > 0 ? Math.round((report.failedRequests / total) * 100) : 0;
    const rpsVal = report.requestsPerSecond ?? 0;
    const hasErr = report.failedRequests > 0;

    const w1 = Math.floor(width * 0.17);
    const w2 = Math.floor(width * 0.19);
    const w3 = Math.floor(width * 0.16);
    const w4 = Math.floor(width * 0.2);
    const w5 = width - (w1 + w2 + w3 + w4 + 4);

    const latPoints = [
        report.latency.min ?? 0,
        report.latency.p50 ?? 0,
        report.latency.p90 ?? 0,
        report.latency.p95 ?? 0,
        report.latency.p99 ?? 0,
    ];
    const curveInner = Math.max(10, w5 - 4);
    const rTitle = theme.whiteBold("Latency Profile");
    const rMeta = `${theme.muted("P50:")} ${theme.cyanBold(formatLatency(report.latency.p50))}`;
    const rGap = Math.max(1, curveInner - visibleLength(rTitle) - visibleLength(rMeta));
    const curveRows = renderMiniBrailleCurve(latPoints, curveInner, 1, theme.purple);

    const kpiRow = renderHorizontalBoxes(
        [
            renderBox({
                width: w1,
                borderColor: theme.border,
                lines: [
                    theme.muted("Total Requests"),
                    theme.whiteBold(total.toLocaleString("en-US")),
                ],
            }),
            renderBox({
                width: w2,
                borderColor: theme.borderEmerald,
                lines: [
                    theme.emerald("Successful"),
                    theme.emeraldBold(`${okPct}% (${report.successfulRequests.toLocaleString("en-US")})`),
                ],
            }),
            renderBox({
                width: w3,
                borderColor: hasErr ? theme.borderRose : theme.border,
                lines: [
                    hasErr ? theme.rose("Failed") : theme.muted("Failed"),
                    hasErr
                        ? theme.roseBold(`${report.failedRequests} (${errPct}%)`)
                        : theme.whiteBold("0 (0%)"),
                ],
            }),
            renderBox({
                width: w4,
                borderColor: theme.borderCyan,
                lines: [
                    theme.cyan("RPS (Avg)"),
                    `${theme.whiteBold(rpsVal.toFixed(2))} ${theme.muted("req/s")}`,
                ],
            }),
            renderBox({
                width: w5,
                borderColor: theme.borderPurple,
                lines: [`${rTitle}${" ".repeat(rGap)}${rMeta}`, curveRows[0] ?? ""],
            }),
        ],
        1
    );

    const panelHeight = Math.max(12, remainingRows - kpiRow.length);
    const lat = report.latency;
    const maxLat = Math.max(lat.max ?? 0, lat.p99 ?? 0, lat.p95 ?? 0, 1);

    const codes = Object.entries(report.statusCodes)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([code, count]) => {
            const num = Number(code);
            const coloredCode =
                num >= 200 && num < 300
                    ? theme.emeraldBold(code)
                    : num >= 400 && num < 500
                      ? theme.amberBold(code)
                      : theme.roseBold(code);
            return `${coloredCode}: ${theme.whiteBold(String(count))}`;
        });

    const modeSummary = report.adaptive
        ? `Concurrency=${report.adaptive.finalConcurrency} (${report.adaptive.concurrencyMode})  ·  Timeout=${report.adaptive.resolvedTimeoutMs}ms (${report.adaptive.timeoutMode})`
        : "Fixed concurrency profile";

    const inner = width - 4;
    const leftWidth = Math.max(38, Math.floor((inner - 3) * 0.48));
    const rightWidth = inner - leftWidth - 3;

    const summaryCol = [
        theme.cyanBold("Test Summary"),
        `${theme.muted("Duration:")}       ${theme.amberBold(formatDuration(report.durationMs))}`,
        `${theme.muted("Average RPS:")}    ${theme.cyanBold(`${rpsVal.toFixed(2)} req/s`)}`,
        `${theme.muted("Latency (avg):")}  ${theme.whiteBold(formatLatency(lat.average))}`,
        `${theme.muted("Engine:")}         ${theme.white(modeSummary)}`,
    ];
    const pctCol = [
        theme.cyanBold("Latency Percentiles"),
        ...renderLatencyBarRow("P50", lat.p50, maxLat, Math.max(8, rightWidth - 18), theme.cyan).split("\n"),
        ...renderLatencyBarRow("P90", lat.p90, maxLat, Math.max(8, rightWidth - 18), theme.blue).split("\n"),
        ...renderLatencyBarRow("P95", lat.p95, maxLat, Math.max(8, rightWidth - 18), theme.purple).split("\n"),
        ...renderLatencyBarRow("P99", lat.p99, maxLat, Math.max(8, rightWidth - 18), theme.amber).split("\n"),
    ];

    const twoCols = renderSplitColumns(
        summaryCol,
        pctCol.map((c) => `${theme.border("│")} ${c}`),
        leftWidth,
        rightWidth + 2,
        1
    );

    const statusBannerBox = renderBox({
        width: inner,
        borderColor: aborted || hasErr ? theme.borderAmber : theme.borderEmerald,
        lines: [
            aborted
                ? `${theme.amberBold("●")}  ${theme.amberBold("Test stopped early (partial results saved)")}`
                : hasErr
                  ? `${theme.amberBold("●")}  ${theme.amberBold(`Test completed with ${report.failedRequests} failed requests`)}`
                  : `${theme.emeraldBold("●")}  ${theme.emeraldBold("Test completed successfully!")}`,
        ],
    });

    const mainPanelLines: string[] = [
        ...twoCols,
        "",
        theme.border("─".repeat(inner)),
        theme.cyanBold("Result Breakdown"),
        `  ${theme.emeraldBold("●")} ${theme.emerald("Successful:")} ${theme.emeraldBold(`${report.successfulRequests.toLocaleString("en-US")} (${okPct}%)`)}   ${hasErr ? theme.roseBold("●") : theme.muted("●")} ${theme.muted("Failed:")} ${hasErr ? theme.roseBold(`${report.failedRequests} (${errPct}%)`) : theme.white("0 (0%)")}`,
        `  ${theme.muted("Status Codes:")} ${codes.join("   ") || theme.muted("None")}   ${theme.border("│")}   ${theme.muted(`HTTP Errors: ${report.httpErrors}  │  Network Errors: ${report.networkErrors}  │  Timeouts: ${report.timeouts}`)}`,
        ...(filePath
            ? wrapPlainText(`Saved JSON: ${filePath}`, inner).map((l) => theme.blue(`  ${l}`))
            : [theme.muted("  Report auto-save disabled in Settings.")]),
    ];

    const bodyTarget = Math.max(10, panelHeight - 2);
    while (mainPanelLines.length + statusBannerBox.length < bodyTarget) {
        mainPanelLines.push("");
    }
    mainPanelLines.push(...statusBannerBox);

    const mainBox = renderBox({
        title: theme.cyanBold("Summary & Breakdown"),
        rightTitle: theme.muted(formatDuration(report.durationMs)),
        width,
        height: panelHeight,
        borderColor: theme.border,
        lines: mainPanelLines,
    });

    return [...kpiRow, ...mainBox];
}

function formatStepCause(step: CapacityReport["steps"][number]): string {
    const causes: string[] = [];
    if (step.timeoutCount > 0) causes.push(`to=${step.timeoutCount}`);
    if (step.rateLimitedCount > 0) causes.push(`429=${step.rateLimitedCount}`);
    if (step.http5xxCount > 0) causes.push(`5xx=${step.http5xxCount}`);
    if (step.networkErrorCount > 0) causes.push(`net=${step.networkErrorCount}`);
    return causes.length > 0 ? causes.join(",") : "none";
}

function renderCapacityReportBody(
    report: CapacityReport,
    filePath: string | null,
    width: number,
    remainingRows: number
): string[] {
    const unit = formatCapacityUnit(report);

    const w1 = Math.floor(width * 0.19);
    const w2 = Math.floor(width * 0.2);
    const w3 = Math.floor(width * 0.18);
    const w4 = Math.floor(width * 0.19);
    const w5 = width - (w1 + w2 + w3 + w4 + 4);

    const stepRates = report.steps.map((s) => s.goodputRps);
    const curveInner = Math.max(10, w5 - 4);
    const rTitle = theme.whiteBold("Rate Curve");
    const minR = stepRates.length > 0 ? Math.min(...stepRates) : 0;
    const maxR = stepRates.length > 0 ? Math.max(...stepRates) : 0;
    const rMeta = `${theme.muted("Peak:")} ${theme.cyanBold(maxR.toFixed(0))}`;
    const rGap = Math.max(1, curveInner - visibleLength(rTitle) - visibleLength(rMeta));
    const curveRows = renderMiniBrailleCurve(stepRates, curveInner, 1, theme.cyan);

    const kpiRow = renderHorizontalBoxes(
        [
            renderBox({
                width: w1,
                borderColor: theme.borderEmerald,
                lines: [
                    theme.emerald("Max Safe Capacity"),
                    theme.emeraldBold(`${report.maxSafeConcurrency} ${unit}`),
                ],
            }),
            renderBox({
                width: w2,
                borderColor: theme.borderCyan,
                lines: [
                    theme.cyan("Delivered Speed"),
                    theme.cyanBold(`${report.maxSafeRps.toFixed(1)} users/sec`),
                ],
            }),
            renderBox({
                width: w3,
                borderColor: report.breakingConcurrency === null ? theme.border : theme.borderRose,
                lines: [
                    theme.rose("Breaking Point"),
                    report.breakingConcurrency === null
                        ? theme.emeraldBold("Not reached")
                        : theme.roseBold(`${report.breakingConcurrency} ${unit}`),
                ],
            }),
            renderBox({
                width: w4,
                borderColor: theme.borderAmber,
                lines: [
                    theme.amber("Safe Target (-20%)"),
                    theme.amberBold(`${report.recommendedConcurrency} ${unit}`),
                ],
            }),
            renderBox({
                width: w5,
                borderColor: theme.border,
                lines: [
                    `${rTitle}${" ".repeat(rGap)}${rMeta}`,
                    curveRows[0] ?? `${theme.muted("Min:")} ${minR.toFixed(0)}`,
                ],
            }),
        ],
        1
    );

    const innerWidth = width - 4;
    const summaryWrapped = wrapPlainText(report.summary, innerWidth - 9);
    const summaryLines = [
        ...summaryWrapped.map((line, i) =>
            i === 0
                ? `${theme.emeraldBold("Summary:")} ${theme.white(line)}`
                : `         ${theme.white(line)}`
        ),
        ...(filePath
            ? wrapPlainText(filePath, innerWidth - 12).map((line, i) =>
                  i === 0
                      ? `${theme.muted("Saved JSON:")} ${theme.blue(line)}`
                      : `            ${theme.blue(line)}`
              )
            : [theme.muted("Report auto-save is disabled in Settings.")]),
    ];

    const summaryBox = renderBox({
        width,
        borderColor: theme.borderCyan,
        lines: summaryLines,
    });

    const tableBoxHeight = Math.max(8, remainingRows - kpiRow.length - summaryBox.length);
    const maxVisibleSteps = Math.max(3, tableBoxHeight - 5);
    const visibleSteps = report.steps.slice(-maxVisibleSteps);
    const showExtendedCols = innerWidth >= 96;
    const maxGoodput = Math.max(1, ...report.steps.map((s) => s.goodputRps));

    const header = [
        "Step".padEnd(4),
        "Users".padStart(6),
        "OK / Total".padStart(11),
        "Err%".padStart(6),
        "Users/sec".padStart(10),
        "P50".padStart(7),
        "P95".padStart(7),
        "Status".padEnd(9),
        ...(showExtendedCols ? ["Failures".padEnd(10), "Capacity Scale"] : []),
    ].join(" │ ");

    const tableLines: string[] = [
        padRightVisible(theme.cyanBold(header), innerWidth),
        theme.border("─".repeat(innerWidth)),
    ];

    for (let idx = 0; idx < visibleSteps.length; idx++) {
        const step = visibleSteps[idx];
        const verdictText =
            step.verdict === "healthy"
                ? theme.emeraldBold("HEALTHY  ")
                : step.verdict === "degraded"
                  ? theme.amberBold("SLOW/WARN")
                  : theme.roseBold("LIMIT HIT");
        const okCol = `${step.successfulRequests}/${step.totalRequests}`.padStart(11);
        const errCol = `${(step.errorRate * 100).toFixed(1)}%`.padStart(6);
        const rpsCol = `${step.goodputRps.toFixed(1)}/s`.padStart(10);
        const p50Col =
            step.p50LatencyMs === null
                ? "--".padStart(7)
                : `${Math.round(step.p50LatencyMs)}ms`.padStart(7);
        const p95Col =
            step.p95LatencyMs === null
                ? "--".padStart(7)
                : `${Math.round(step.p95LatencyMs)}ms`.padStart(7);

        let extra = "";
        if (showExtendedCols) {
            const cause = formatStepCause(step).padEnd(10);
            const barMax = Math.max(6, Math.min(20, innerWidth - 101));
            const filled = Math.max(
                step.goodputRps > 0 ? 1 : 0,
                Math.round((step.goodputRps / maxGoodput) * barMax)
            );
            const barColor =
                step.verdict === "healthy"
                    ? theme.emerald
                    : step.verdict === "degraded"
                      ? theme.amber
                      : theme.rose;
            const bar = `${barColor("▇".repeat(filled))}${theme.border("─".repeat(Math.max(0, barMax - filled)))}`;
            extra = ` │ ${step.failedRequests > 0 ? theme.amber(cause) : theme.muted(cause)} │ ${bar}`;
        }

        const rawRow = `${String(step.stepNumber).padEnd(4)} │ ${theme.whiteBold(String(step.concurrency).padStart(6))} │ ${okCol} │ ${
            step.errorRate > 0 ? theme.roseBold(errCol) : theme.emerald(errCol)
        } │ ${theme.cyanBold(rpsCol)} │ ${p50Col} │ ${p95Col} │ ${verdictText}${extra}`;
        const paddedRow = padRightVisible(rawRow, innerWidth);
        tableLines.push(idx % 2 === 1 ? theme.zebraRow(paddedRow) : paddedRow);
    }

    const rttText =
        report.baselineMinRttMs === null ? "--" : `${report.baselineMinRttMs.toFixed(0)}ms`;
    const modeNice =
        report.mode === "burst"
            ? `Users/sec Spike (${report.stepDurationSeconds}s)`
            : `Steady (${report.stepDurationSeconds}s)`;
    const metaRight = `${modeNice} · Policy: ${report.stopPolicy} · RTT ${rttText} · Timeout ${report.resolvedTimeoutMs}ms`;

    const tableBox = renderBox({
        title: theme.purpleBold("Step-by-Step Load Progression"),
        rightTitle: theme.muted(metaRight),
        width,
        height: tableBoxHeight,
        borderColor: theme.border,
        lines: tableLines,
    });

    return [...kpiRow, ...tableBox, ...summaryBox];
}

export function renderResultsScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const results = state.results;
    const kindLabel =
        results?.record.kind === "capacity" ? "Capacity Discovery Report" : "Load Test Report";

    const topBar = renderTopBar({
        breadcrumbs: ["Report", kindLabel],
        statusLabel: results?.aborted ? "PARTIAL" : "COMPLETE",
        statusTone: results?.aborted ? "amber" : "emerald",
        rightMeta: results ? `${results.record.method} ${results.record.targetUrl}` : "",
        width,
    });

    const bottomBar = renderBottomBar(
        results?.fromHistory
            ? [["Enter / Esc", "Back to Reports"]]
            : [
                  ["Enter", "Home"],
                  ["r", "Re-run"],
                  ["n", "Edit Options"],
                  ["Esc", "Home"],
              ],
        results?.filePath ? "Saved" : "Transient",
        width
    );

    if (!results) {
        return composeFullScreen(
            topBar,
            renderBox({
                width,
                height: bodyRows,
                lines: [theme.muted("No report loaded.")],
            }),
            bottomBar,
            size
        );
    }

    const bannerLines: string[] = [];
    const statusBanner = results.aborted
        ? theme.amberBold("Stopped Early (Partial Results)")
        : results.record.kind === "capacity"
          ? theme.emeraldBold("Capacity Discovery Report")
          : theme.emeraldBold("Load Test Report");

    bannerLines.push(
        `${statusBanner}   ${theme.border("│")}   ${theme.whiteBold(`${results.record.method} ${results.record.targetUrl}`)}`
    );

    if (results.record.kind === "capacity") {
        const cap = results.record.report;
        const unit = formatCapacityUnit(cap);
        const answerText =
            cap.maxSafeConcurrency > 0
                ? `Answer: Safely handles ~${cap.maxSafeConcurrency} ${unit} (${cap.maxSafeRps.toFixed(1)} users/sec real speed) — safe target: ${cap.recommendedConcurrency} ${unit}`
                : `Answer: Target failed even at ${cap.breakingConcurrency ?? "?"} ${unit} — lower Start Users or inspect server limits`;
        bannerLines.push(
            cap.maxSafeConcurrency > 0
                ? theme.emerald(answerText)
                : theme.roseBold(answerText)
        );
    }

    const bannerBox = renderBox({
        width,
        borderColor: results.aborted ? theme.borderAmber : theme.borderEmerald,
        lines: bannerLines,
    });

    const remainingRows = Math.max(12, bodyRows - bannerBox.length);
    const bodyContent =
        results.record.kind === "load-test"
            ? renderLoadTestReportBody(
                  results.record.report,
                  results.filePath,
                  results.aborted,
                  width,
                  remainingRows
              )
            : renderCapacityReportBody(
                  results.record.report,
                  results.filePath,
                  width,
                  remainingRows
              );

    return composeFullScreen(topBar, [...bannerBox, ...bodyContent], bottomBar, size);
}
