import type { TerminalSize, TuiAppState } from "../../domain/tui-types.js";
import {
    composeFullScreen,
    getFullScreenDimensions,
    renderBottomBar,
    renderBox,
    renderDualSeriesChart,
    renderHorizontalBoxes,
    renderMiniBrailleCurve,
    renderProgressBar,
    renderSplitColumns,
    renderTopBar,
} from "../components/tui-primitives.js";
import { padRightVisible, theme, visibleLength } from "../theme/ansi-palette.js";

function formatClock(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

function formatMs(value: number | null): string {
    return value === null ? "--" : `${Math.round(value)} ms`;
}

export function renderLiveDashboardScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const innerWidth = width - 4;
    const live = state.live;

    const elapsedClock = live ? formatClock(live.elapsedMs) : "00:00";
    const modeLabel =
        state.form.testKind === "capacity" ? "Capacity Discovery" : "Load Test";

    const topBar = renderTopBar({
        breadcrumbs: ["Live Telemetry", modeLabel],
        statusLabel: live?.phase === "probing_timeout" ? "PROBING" : live?.phase === "completing" ? "DRAINING" : "LIVE",
        statusTone: live?.phase === "probing_timeout" || live?.phase === "completing" ? "amber" : "emerald",
        rightMeta: `Elapsed ${elapsedClock}`,
        width,
    });

    const bottomBar = renderBottomBar(
        [["Esc / Ctrl+C", "Stop & view results"]],
        `${state.form.method} ${state.form.url}`,
        width
    );

    if (!live) {
        const initBox = renderBox({
            title: theme.cyanBold("Telemetry Stream"),
            width,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: [theme.muted("Initializing HTTP worker pool and probes...")],
        });
        return composeFullScreen(topBar, initBox, bottomBar, size);
    }

    const phaseText =
        live.phase === "probing_timeout"
            ? theme.amberBold("Measuring baseline response time")
            : live.phase === "discovering"
              ? theme.emeraldBold("Escalating users/sec")
              : live.phase === "completing"
                ? theme.amberBold("Finishing in-flight requests")
                : theme.emeraldBold("Running load test");

    let progressRatio = 0;
    let timeSummary = elapsedClock;

    if (live.targetDurationMs !== undefined && live.targetDurationMs > 0) {
        progressRatio = Math.min(1, live.elapsedMs / live.targetDurationMs);
        timeSummary = `${elapsedClock} / ${formatClock(live.targetDurationMs)}`;
    } else if (live.targetRequests !== undefined && live.targetRequests > 0) {
        progressRatio = Math.min(1, live.totalRequests / live.targetRequests);
        timeSummary = `${live.totalRequests} / ${live.targetRequests} reqs`;
    } else if (state.form.testKind === "capacity") {
        progressRatio = Math.min(0.95, (live.capacitySteps.length + 0.5) / 8);
        timeSummary = `Step ${live.capacitySteps.length + 1}`;
    }

    const barWidth = Math.max(16, innerWidth - 50);
    const pctText = `${Math.round(progressRatio * 100)}%`;
    const statusHeader = `${theme.emeraldBold("●")} ${phaseText}  ${theme.whiteBold(timeSummary)}  ${renderProgressBar(
        progressRatio,
        barWidth
    )} ${theme.cyanBold(pctText)}`;

    const metaLine =
        `${theme.muted("Target:")} ${theme.whiteBold(`${state.form.method} ${state.form.url}`)}   ` +
        `${theme.muted("Active Users:")} ${theme.cyanBold(String(live.currentConcurrency))}   ` +
        `${theme.muted("Avg Latency:")} ${theme.purpleBold(formatMs(live.avgLatencyMs))}   ` +
        `${theme.muted("Timeout:")} ${theme.amber(live.resolvedTimeoutMs > 0 ? `${live.resolvedTimeoutMs}ms` : "auto")}`;

    const headerBox = renderBox({
        width,
        borderColor: theme.border,
        lines: [statusHeader, padRightVisible(metaLine, innerWidth)],
    });

    const w1 = Math.max(18, Math.floor(width * 0.16));
    const w2 = Math.max(18, Math.floor(width * 0.18));
    const w3 = Math.max(15, Math.floor(width * 0.13));
    const w4 = Math.max(20, Math.floor(width * 0.19));
    const w5 = width - (w1 + w2 + w3 + w4 + 4);

    const okPct =
        live.totalRequests > 0
            ? Math.round((live.successfulRequests / live.totalRequests) * 100)
            : 100;
    const errPct = (live.errorRate * 100).toFixed(1);
    const hasErr = live.failedRequests > 0;

    const minR = live.historyRps.length > 0 ? Math.min(...live.historyRps) : 0;
    const maxR = live.historyRps.length > 0 ? Math.max(...live.historyRps) : 0;
    const curveInner = Math.max(10, w5 - 4);
    const rTitle = theme.whiteBold("Request Rate");
    const fullRMeta = `${theme.muted("Min:")} ${theme.white(minR.toFixed(0))} ${theme.muted("Max:")} ${theme.cyanBold(maxR.toFixed(0))}`;
    const compactRMeta = `${theme.white(minR.toFixed(0))}${theme.muted("–")}${theme.cyanBold(maxR.toFixed(0))}${theme.muted("/s")}`;
    const rMeta =
        visibleLength(rTitle) + 1 + visibleLength(fullRMeta) <= curveInner
            ? fullRMeta
            : compactRMeta;
    const rGap = Math.max(1, curveInner - visibleLength(rTitle) - visibleLength(rMeta));
    const curveRows = renderMiniBrailleCurve(live.historyRps, curveInner, 1, theme.cyan);

    const cardsRow = renderHorizontalBoxes(
        [
            renderBox({
                width: w1,
                borderColor: theme.border,
                lines: [
                    theme.muted("Total Requests"),
                    theme.whiteBold(live.totalRequests.toLocaleString("en-US")),
                ],
            }),
            renderBox({
                width: w2,
                borderColor: theme.borderEmerald,
                lines: [
                    theme.emerald("Successful"),
                    theme.emeraldBold(`${okPct}% (${live.successfulRequests})`),
                ],
            }),
            renderBox({
                width: w3,
                borderColor: hasErr ? theme.borderRose : theme.border,
                lines: [
                    hasErr ? theme.rose("Failed") : theme.muted("Failed"),
                    hasErr
                        ? theme.roseBold(`${live.failedRequests} (${errPct}%)`)
                        : theme.whiteBold(`0 (0.0%)`),
                ],
            }),
            renderBox({
                width: w4,
                borderColor: theme.borderCyan,
                lines: [
                    theme.cyan("Live Speed"),
                    `${theme.whiteBold(live.instantRps.toFixed(1))} ${theme.muted("req/s")}  ${theme.purpleBold(formatMs(live.p95LatencyMs))}`,
                ],
            }),
            renderBox({
                width: w5,
                borderColor: theme.border,
                lines: [`${rTitle}${" ".repeat(rGap)}${rMeta}`, curveRows[0] ?? ""],
            }),
        ],
        1
    );

    const mainHeight = Math.max(9, bodyRows - headerBox.length - cardsRow.length);

    let mainSection: string[];

    if (state.form.testKind === "capacity" && width >= 106) {
        const chartBoxWidth = Math.max(58, Math.floor(width * 0.6));
        const feedBoxWidth = width - chartBoxWidth - 1;
        const chartHeight = Math.max(5, mainHeight - 4);

        const chartBox = renderBox({
            title: theme.cyanBold("Real-Time Speed & Latency"),
            rightTitle: theme.muted("live 200ms ticks"),
            width: chartBoxWidth,
            height: mainHeight,
            borderColor: theme.borderCyan,
            lines: renderDualSeriesChart({
                width: chartBoxWidth - 4,
                height: chartHeight,
                rpsValues: live.historyRps,
                latencyValues: live.historyP95Latency,
            }),
        });

        const feedInner = feedBoxWidth - 4;
        const feedLines: string[] = [];
        const feedHeader = `${"Step".padEnd(4)} │ ${"Users".padStart(5)} │ ${"OK/Tot".padStart(8)} │ ${"Users/s".padStart(7)} │ Status`;
        feedLines.push(theme.cyanBold(feedHeader));
        feedLines.push(theme.border("─".repeat(Math.min(feedInner, feedHeader.length + 2))));

        const maxStepsVisible = Math.max(4, mainHeight - 5);
        const visibleSteps = live.capacitySteps.slice(-maxStepsVisible);
        if (visibleSteps.length === 0) {
            feedLines.push("");
            feedLines.push(theme.muted("  Testing initial baseline load..."));
        } else {
            for (const s of visibleSteps) {
                const verdictText =
                    s.verdict === "healthy"
                        ? theme.emeraldBold("HEALTHY")
                        : s.verdict === "degraded"
                          ? theme.amberBold("SLOW")
                          : theme.roseBold("LIMIT");
                const okTot = `${s.successfulRequests}/${s.totalRequests}`.padStart(8);
                const rps = `${s.goodputRps.toFixed(0)}/s`.padStart(7);
                feedLines.push(
                    padRightVisible(
                        `${String(s.stepNumber).padEnd(4)} │ ${theme.whiteBold(String(s.concurrency).padStart(5))} │ ${okTot} │ ${theme.cyanBold(rps)} │ ${verdictText}`,
                        feedInner
                    )
                );
            }
        }

        const feedBox = renderBox({
            title: theme.purpleBold("Step Progression"),
            rightTitle: theme.emeraldBold(`${live.capacitySteps.length} completed`),
            width: feedBoxWidth,
            height: mainHeight,
            borderColor: theme.border,
            lines: feedLines,
        });

        mainSection = renderSplitColumns(chartBox, feedBox, chartBoxWidth, feedBoxWidth, 1);
    } else {
        const extraStepRow = state.form.testKind === "capacity" ? 2 : 0;
        const chartHeight = Math.max(5, mainHeight - 4 - extraStepRow);
        const chartLines = renderDualSeriesChart({
            width: innerWidth,
            height: chartHeight,
            rpsValues: live.historyRps,
            latencyValues: live.historyP95Latency,
        });

        if (state.form.testKind === "capacity") {
            chartLines.push("");
            if (live.capacitySteps.length === 0) {
                chartLines.push(`${theme.muted("Steps:")} ${theme.muted("Measuring Step 1...")}`);
            } else {
                const pills = live.capacitySteps
                    .slice(-5)
                    .map((s) => {
                        const mark =
                            s.verdict === "healthy"
                                ? theme.emeraldBold("OK")
                                : s.verdict === "degraded"
                                  ? theme.amberBold("SLOW")
                                  : theme.roseBold("LIMIT");
                        return `${theme.white(`S${s.stepNumber}(${s.concurrency}u)`)} ${theme.cyan(`${s.goodputRps.toFixed(0)}/s`)} ${mark}`;
                    })
                    .join(theme.border("  │  "));
                chartLines.push(`${theme.muted("Steps:")} ${pills}`);
            }
        }

        mainSection = renderBox({
            title: theme.cyanBold("Real-Time Speed & Latency"),
            rightTitle: theme.muted("live 200ms ticks"),
            width,
            height: mainHeight,
            borderColor: theme.borderCyan,
            lines: chartLines,
        });
    }

    return composeFullScreen(
        topBar,
        [...headerBox, ...cardsRow, ...mainSection],
        bottomBar,
        size
    );
}
