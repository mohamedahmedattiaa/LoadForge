import { TUI_MAIN_MENU_ITEMS } from "../../domain/tui-state-service.js";
import type { TerminalSize, TuiAppState } from "../../domain/tui-types.js";
import type { SavedReportRecord } from "../../../metrics/domain/report-repository-port.js";
import {
    composeFullScreen,
    getFullScreenDimensions,
    renderBottomBar,
    renderBox,
    renderHorizontalBoxes,
    renderMiniBrailleCurve,
    renderSplitColumns,
    wrapPlainText,
} from "../components/tui-primitives.js";
import { padRightVisible, theme, visibleLength } from "../theme/ansi-palette.js";

type MenuId = (typeof TUI_MAIN_MENU_ITEMS)[number]["id"];

const MENU_DETAILS: Record<
    MenuId,
    {
        shortSub: string;
        headline: string;
        summary: string;
        cliExample: string;
    }
> = {
    "new-load-test": {
        shortSub: "Run a benchmark with custom options",
        headline: "HTTP Load Benchmark",
        summary:
            "Test your server's performance, find bottlenecks, and verify it can handle target traffic with confidence.",
        cliExample: "loadforge run -u https://api.example.com -d 10",
    },
    "capacity-discovery": {
        shortSub: "Find max users/sec your server holds",
        headline: "Capacity Discovery (Users / Sec)",
        summary:
            "Automatically escalates traffic step-by-step to find max safe users/sec, breaking point, and recommended 20% headroom.",
        cliExample: "loadforge discover -u https://api.example.com --mode burst -w 1",
    },
    "previous-reports": {
        shortSub: "Browse saved load & capacity reports",
        headline: "Saved JSON Report Archive",
        summary:
            "Inspect saved load test and capacity discovery runs stored in ~/.loadforge/reports with full percentile tables.",
        cliExample: "ls -lt ~/.loadforge/reports",
    },
    configuration: {
        shortSub: "Set default values, workers & timeouts",
        headline: "Default Profile & Persistence",
        summary:
            "Configure default HTTP method, worker concurrency mode, request timeout, capacity window, and JSON auto-save.",
        cliExample: "Saved in ~/.loadforge/preferences.json",
    },
    about: {
        shortSub: "Engine architecture, guide & CLI usage",
        headline: "LoadForge Runtime & Engine",
        summary:
            "Modular TypeScript Clean Architecture compiled into a standalone zero-dependency Node single executable.",
        cliExample: "loadforge --help",
    },
    exit: {
        shortSub: "Close LoadForge and return to shell",
        headline: "Exit Session",
        summary:
            "Close LoadForge cleanly and restore your shell. Saved reports and preferences stay safely stored on disk.",
        cliExample: "Press Enter, q, or Esc",
    },
};

function fmtInt(n: number): string {
    return Math.round(n).toLocaleString("en-US");
}

function fmtMs(v: number | null | undefined): string {
    return v === null || v === undefined ? "--" : `${v.toFixed(2)} ms`;
}

function renderHeaderStrip(width: number): string {
    const logo = `${theme.cyanBold("◆")} ${theme.whiteBold("LOAD")}${theme.cyanBold("FORGE")}`;
    const tagline = theme.muted("HTTP Load Testing & Users/Sec Capacity Studio");
    const left = ` ${logo}  ${theme.border("│")}  ${tagline}`;
    const right = `${theme.emeraldBold("●")} ${theme.emerald("Ready")}  ${theme.border("│")}  ${theme.muted("v1.0.0")} `;
    const gap = Math.max(2, width - visibleLength(left) - visibleLength(right));
    return theme.barSurface(padRightVisible(`${left}${" ".repeat(gap)}${right}`, width));
}

function pickFeaturedReport(state: TuiAppState): SavedReportRecord | null {
    if (state.savedReports.length === 0) {
        return null;
    }
    const activeId = TUI_MAIN_MENU_ITEMS[state.menuIndex]?.id;
    if (activeId === "capacity-discovery") {
        const cap = state.savedReports.find((r) => r.record.kind === "capacity");
        if (cap) return cap.record;
    } else if (activeId === "new-load-test") {
        const load = state.savedReports.find((r) => r.record.kind === "load-test");
        if (load) return load.record;
    }
    return state.savedReports[0].record;
}

function buildTopKpiStrip(state: TuiAppState, width: number): string[] {
    const featured = pickFeaturedReport(state);

    const w1 = Math.max(18, Math.floor(width * 0.16));
    const w2 = Math.max(18, Math.floor(width * 0.18));
    const w3 = Math.max(14, Math.floor(width * 0.13));
    const w4 = Math.max(19, Math.floor(width * 0.18));
    const w5 = width - (w1 + w2 + w3 + w4 + 4);

    let c1: string[];
    let c2: string[];
    let c3: string[];
    let c4: string[];
    let series: number[] = [];
    let rateHeader = theme.whiteBold("Request Rate");
    let rateMeta = theme.muted("Ready");
    let minVal = 0;
    let maxVal = 0;
    let hasSeriesBounds = false;

    if (featured?.kind === "load-test") {
        const r = featured.report;
        const tot = r.totalRequests;
        const okPct = tot > 0 ? Math.round((r.successfulRequests / tot) * 100) : 0;
        const errPct = tot > 0 ? Math.round((r.failedRequests / tot) * 100) : 0;
        const rps = r.requestsPerSecond ?? 0;

        c1 = [theme.muted("Total Requests"), theme.whiteBold(fmtInt(tot))];
        c2 = [
            theme.emerald("Successful"),
            theme.emeraldBold(`${okPct}% (${fmtInt(r.successfulRequests)})`),
        ];
        c3 = [
            theme.rose("Failed"),
            r.failedRequests > 0
                ? theme.roseBold(`${fmtInt(r.failedRequests)} (${errPct}%)`)
                : theme.whiteBold(`0 (0%)`),
        ];
        c4 = [
            theme.cyan("RPS (Avg)"),
            `${theme.whiteBold(rps.toFixed(2))} ${theme.muted("req/s")}`,
        ];

        const loadRates = state.savedReports
            .filter((e) => e.record.kind === "load-test")
            .slice(0, 10)
            .reverse()
            .map((e) => (e.record.kind === "load-test" ? (e.record.report.requestsPerSecond ?? 0) : 0))
            .filter((v) => v > 0);
        series = loadRates.length >= 2 ? loadRates : [rps * 0.65, rps * 0.85, rps, rps * 0.92, rps];
        minVal = Math.min(...series);
        maxVal = Math.max(...series);
        hasSeriesBounds = true;
    } else if (featured?.kind === "capacity") {
        const cap = featured.report;
        const totalOk = cap.steps.reduce((acc, s) => acc + s.successfulRequests, 0);
        const totalAll = cap.steps.reduce((acc, s) => acc + s.totalRequests, 0);
        const totalFail = totalAll - totalOk;
        const okPct = totalAll > 0 ? Math.round((totalOk / totalAll) * 100) : 0;
        const errPct = totalAll > 0 ? Math.round((totalFail / totalAll) * 100) : 0;

        c1 = [
            theme.muted("Max Safe Users"),
            theme.whiteBold(`${cap.maxSafeConcurrency} users/s`),
        ];
        c2 = [
            theme.emerald("Successful"),
            theme.emeraldBold(`${okPct}% (${fmtInt(totalOk)})`),
        ];
        c3 = [
            theme.rose("Failed"),
            totalFail > 0
                ? theme.roseBold(`${fmtInt(totalFail)} (${errPct}%)`)
                : theme.whiteBold(`0 (0%)`),
        ];
        c4 = [
            theme.cyan("Delivered Speed"),
            `${theme.whiteBold(cap.maxSafeRps.toFixed(1))} ${theme.muted("users/s")}`,
        ];

        series = cap.steps.map((s) => s.goodputRps);
        minVal = series.length > 0 ? Math.min(...series) : 0;
        maxVal = series.length > 0 ? Math.max(...series) : 0;
        hasSeriesBounds = true;
    } else {
        const prefs = state.preferences;
        c1 = [theme.muted("Saved Reports"), theme.whiteBold("0")];
        c2 = [theme.emerald("Status"), theme.emeraldBold("Engine Ready")];
        c3 = [theme.cyan("Default Method"), theme.whiteBold(prefs.defaultMethod)];
        c4 = [theme.purple("Concurrency"), theme.whiteBold(prefs.defaultConcurrency)];
        series = [];
        rateHeader = theme.whiteBold("Telemetry Curve");
        rateMeta = theme.muted("Run test to plot");
    }

    const curveInner = Math.max(10, w5 - 4);
    if (hasSeriesBounds) {
        const fullMeta = `${theme.muted("Min:")} ${theme.white(minVal.toFixed(1))} ${theme.muted("Max:")} ${theme.cyanBold(maxVal.toFixed(1))}`;
        const intMeta = `${theme.muted("Min:")} ${theme.white(minVal.toFixed(0))} ${theme.muted("Max:")} ${theme.cyanBold(maxVal.toFixed(0))}`;
        const rangeMeta = `${theme.white(minVal.toFixed(0))}${theme.muted("–")}${theme.cyanBold(maxVal.toFixed(0))}${theme.muted("/s")}`;
        if (visibleLength(rateHeader) + 1 + visibleLength(fullMeta) <= curveInner) {
            rateMeta = fullMeta;
        } else if (visibleLength(rateHeader) + 1 + visibleLength(intMeta) <= curveInner) {
            rateMeta = intMeta;
        } else {
            rateMeta = rangeMeta;
        }
    }
    const gapHeader = Math.max(
        1,
        curveInner - visibleLength(rateHeader) - visibleLength(rateMeta)
    );
    const rateTopLine = `${rateHeader}${" ".repeat(gapHeader)}${rateMeta}`;
    const curveRows = renderMiniBrailleCurve(series, curveInner, 1, theme.cyan);

    return renderHorizontalBoxes(
        [
            renderBox({ width: w1, borderColor: theme.border, lines: c1 }),
            renderBox({ width: w2, borderColor: theme.borderEmerald, lines: c2 }),
            renderBox({
                width: w3,
                borderColor: featured ? theme.borderRose : theme.border,
                lines: c3,
            }),
            renderBox({ width: w4, borderColor: theme.borderCyan, lines: c4 }),
            renderBox({
                width: w5,
                borderColor: theme.border,
                lines: [rateTopLine, curveRows[0] ?? ""],
            }),
        ],
        1
    );
}

function buildRightPanelLines(
    state: TuiAppState,
    rightInner: number,
    panelHeight: number
): string[] {
    const activeItem = TUI_MAIN_MENU_ITEMS[state.menuIndex] ?? TUI_MAIN_MENU_ITEMS[0];
    const detail = MENU_DETAILS[activeItem.id];
    const tab = state.mainMenuTab;
    const featured = pickFeaturedReport(state);

    const tabs = [
        tab === "details" ? theme.cyanBold("Details") : theme.muted("Details"),
        tab === "help" ? theme.cyanBold("Quick Help") : theme.muted("Quick Help"),
        tab === "start" ? theme.cyanBold("Start Guide") : theme.muted("Start Guide"),
    ];
    const tabHeader = ` ${tabs[0]}   ${theme.border("│")}   ${tabs[1]}   ${theme.border("│")}   ${tabs[2]}`;
    const underline =
        tab === "details"
            ? ` ${theme.cyanBold("━━━━━━━")}`
            : tab === "help"
              ? `              ${theme.cyanBold("━━━━━━━━━━")}`
              : `                              ${theme.cyanBold("━━━━━━━━━━━")}`;

    const lines: string[] = [
        tabHeader,
        `${underline}${theme.border("─".repeat(Math.max(0, rightInner - visibleLength(underline))))}`,
        "",
    ];

    if (tab === "help") {
        lines.push(theme.whiteBold("Keyboard Shortcuts & Modes"));
        lines.push("");
        lines.push(`  ${theme.cyanBold("↑ / ↓")}         Move through Main Menu actions`);
        lines.push(`  ${theme.cyanBold("← / → or ?")}    Switch Details / Quick Help / Start Guide tabs`);
        lines.push(`  ${theme.cyanBold("1 – 6")}         Jump directly to a screen`);
        lines.push(`  ${theme.cyanBold("Enter")}         Open highlighted screen or confirm`);
        lines.push(`  ${theme.cyanBold("Ctrl+R")}        Launch test immediately from Configure screen`);
        lines.push("");
        lines.push(theme.border("─".repeat(rightInner)));
        lines.push("");
        lines.push(theme.purpleBold("Capacity Modes Explained"));
        lines.push(
            ...wrapPlainText(
                "Users/sec Spike: Sends N simultaneous requests per window to find exact users/sec limits.",
                rightInner - 2
            ).map((l) => `  ${theme.emerald(l)}`)
        );
        lines.push(
            ...wrapPlainText(
                "Steady Users: Holds N continuous parallel users across W seconds.",
                rightInner - 2
            ).map((l) => `  ${theme.white(l)}`)
        );
        return lines;
    }

    if (tab === "start") {
        lines.push(theme.whiteBold("Quick Start Workflow"));
        lines.push("");
        lines.push(`  ${theme.emeraldBold("1.")} Pick ${theme.whiteBold("Start a new load test")} or ${theme.whiteBold("Capacity Discovery")}`);
        lines.push(`  ${theme.emeraldBold("2.")} Type your URL, pick HTTP method, and adjust Users / Duration`);
        lines.push(`  ${theme.emeraldBold("3.")} Press ${theme.cyanBold("Ctrl+R")} to watch live Braille charts & full report`);
        lines.push("");
        lines.push(theme.border("─".repeat(rightInner)));
        lines.push("");
        lines.push(theme.cyanBold("CLI Command Equivalent"));
        lines.push(`  ${theme.amberBold(detail.cliExample)}`);
        lines.push("");
        lines.push(
            ...renderBox({
                width: rightInner,
                borderColor: theme.borderCyan,
                lines: [
                    `${theme.cyanBold("●")}  ${theme.whiteBold("Press Enter to open:")} ${theme.emeraldBold(activeItem.label)}`,
                ],
            })
        );
        return lines;
    }

    // Default "Details" tab matching mockup layout
    lines.push(theme.whiteBold(detail.headline));
    lines.push(
        ...wrapPlainText(detail.summary, rightInner).map((l) => theme.muted(l))
    );
    lines.push("");
    lines.push(theme.border("─".repeat(rightInner)));

    const colLeftW = Math.floor((rightInner - 3) / 2);
    const colRightW = rightInner - colLeftW - 3;

    let leftCol: string[];
    let rightCol: string[];
    let breakdownLines: string[];
    let statusBannerText: string;
    let statusBannerColor = theme.borderEmerald;

    if (featured?.kind === "load-test") {
        const r = featured.report;
        leftCol = [
            theme.cyanBold("Test Summary"),
            `${theme.muted("Duration:")}       ${theme.amberBold(`${(r.durationMs / 1000).toFixed(2)} seconds`)}`,
            `${theme.muted("Average RPS:")}    ${theme.cyanBold(`${(r.requestsPerSecond ?? 0).toFixed(2)} req/s`)}`,
            `${theme.muted("Latency (avg):")}  ${theme.whiteBold(fmtMs(r.latency.average))}`,
        ];
        rightCol = [
            theme.cyanBold("Latency Percentiles"),
            `${theme.muted("P50:")}  ${theme.whiteBold(fmtMs(r.latency.p50))}`,
            `${theme.muted("P90:")}  ${theme.whiteBold(fmtMs(r.latency.p90))}`,
            `${theme.muted("P95:")}  ${theme.whiteBold(fmtMs(r.latency.p95))}`,
            `${theme.muted("P99:")}  ${theme.whiteBold(fmtMs(r.latency.p99))}`,
        ];
        const okPct =
            r.totalRequests > 0
                ? Math.round((r.successfulRequests / r.totalRequests) * 100)
                : 0;
        const errPct =
            r.totalRequests > 0
                ? Math.round((r.failedRequests / r.totalRequests) * 100)
                : 0;
        breakdownLines = [
            theme.cyanBold("Result Breakdown"),
            `  ${theme.emeraldBold("●")} ${theme.emerald("Successful:")} ${theme.emeraldBold(`${fmtInt(r.successfulRequests)} (${okPct}%)`)}`,
            `  ${r.failedRequests > 0 ? theme.roseBold("●") : theme.muted("●")} ${theme.muted("Failed:")}     ${r.failedRequests > 0 ? theme.roseBold(`${fmtInt(r.failedRequests)} (${errPct}%)`) : theme.white("0 (0%)")}`,
            `  ${theme.muted("●")} ${theme.muted(`HTTP Errors: ${r.httpErrors}  │  Network Errors: ${r.networkErrors}  │  Timeouts: ${r.timeouts}`)}`,
        ];
        statusBannerText =
            r.failedRequests === 0
                ? `${theme.emeraldBold("●")}  ${theme.emeraldBold("Latest benchmark completed cleanly!")} ${theme.muted(`(${r.latency.p95 !== null ? `P95 ${r.latency.p95.toFixed(0)}ms` : ""})`)}`
                : `${theme.amberBold("●")}  ${theme.amberBold("Completed with failures")} ${theme.muted(`(${r.failedRequests} failed of ${r.totalRequests})`)}`;
        statusBannerColor = r.failedRequests === 0 ? theme.borderEmerald : theme.borderAmber;
    } else if (featured?.kind === "capacity") {
        const cap = featured.report;
        const unit = cap.mode === "burst" ? "users/s" : "concurrent";
        const bestHealthy = [...cap.steps]
            .reverse()
            .find((s) => s.verdict === "healthy");
        leftCol = [
            theme.cyanBold("Capacity Summary"),
            `${theme.muted("Max Safe:")}       ${theme.emeraldBold(`${cap.maxSafeConcurrency} ${unit}`)}`,
            `${theme.muted("Delivered Rate:")} ${theme.cyanBold(`${cap.maxSafeRps.toFixed(1)} users/sec`)}`,
            `${theme.muted("Safe Target:")}    ${theme.amberBold(`${cap.recommendedConcurrency} ${unit} (-20%)`)}`,
        ];
        rightCol = [
            theme.cyanBold("Latency & Stability"),
            `${theme.muted("Base RTT:")}  ${theme.whiteBold(fmtMs(cap.baselineMinRttMs))}`,
            `${theme.muted("Step P50:")}  ${theme.whiteBold(fmtMs(bestHealthy?.p50LatencyMs))}`,
            `${theme.muted("Step P95:")}  ${theme.whiteBold(fmtMs(bestHealthy?.p95LatencyMs))}`,
            `${theme.muted("Timeout:")}   ${theme.whiteBold(`${cap.resolvedTimeoutMs} ms`)}`,
        ];
        const totalOk = cap.steps.reduce((a, s) => a + s.successfulRequests, 0);
        const totalAll = cap.steps.reduce((a, s) => a + s.totalRequests, 0);
        const totalFail = totalAll - totalOk;
        const okPct = totalAll > 0 ? Math.round((totalOk / totalAll) * 100) : 0;
        breakdownLines = [
            theme.cyanBold("Discovery Breakdown"),
            `  ${theme.emeraldBold("●")} ${theme.emerald("Healthy Requests:")} ${theme.emeraldBold(`${fmtInt(totalOk)} (${okPct}%) across ${cap.steps.length} steps`)}`,
            `  ${theme.roseBold("●")} ${theme.muted("Breaking Point:")}   ${cap.breakingConcurrency !== null ? theme.roseBold(`${cap.breakingConcurrency} ${unit} (${cap.stopReason})`) : theme.emerald("Not reached")}`,
            `  ${theme.muted("●")} ${theme.muted(`Total Failed: ${totalFail}  │  Target: ${cap.url}`)}`,
        ];
        statusBannerText = `${theme.emeraldBold("●")}  ${theme.emeraldBold(`Safe ceiling: ~${cap.maxSafeConcurrency} ${unit}`)} ${theme.muted(`(Recommended: ${cap.recommendedConcurrency})`)}`;
    } else {
        const prefs = state.preferences;
        leftCol = [
            theme.cyanBold("Default Profile"),
            `${theme.muted("Method:")}      ${theme.whiteBold(prefs.defaultMethod)}`,
            `${theme.muted("Concurrency:")} ${theme.cyanBold(prefs.defaultConcurrency)}`,
            `${theme.muted("Timeout:")}     ${theme.amberBold(prefs.defaultTimeout)}`,
        ];
        rightCol = [
            theme.cyanBold("Engine Guarantees"),
            `${theme.muted("Timing:")}    ${theme.white("High-res perf_hooks")}`,
            `${theme.muted("Queue:")}     ${theme.white("Bounded backpressure")}`,
            `${theme.muted("Charts:")}    ${theme.white("200ms live Braille")}`,
            `${theme.muted("Reports:")}   ${theme.white(prefs.autoSaveReports ? "Auto-save JSON" : "Manual")}`,
        ];
        breakdownLines = [
            theme.cyanBold("Quick Command Reference"),
            `  ${theme.emeraldBold("●")} ${theme.amberBold(detail.cliExample)}`,
            `  ${theme.muted("●")} ${theme.muted("Saved reports will automatically populate these live cards.")}`,
        ];
        statusBannerText = `${theme.emeraldBold("●")}  ${theme.emeraldBold("Ready!")} ${theme.muted(`Press Enter to open ${activeItem.label}`)}`;
    }

    const maxColsRows = Math.max(leftCol.length, rightCol.length);
    for (let i = 0; i < maxColsRows; i++) {
        const l = padRightVisible(leftCol[i] ?? "", colLeftW);
        const r = padRightVisible(rightCol[i] ?? "", colRightW);
        lines.push(`${l} ${theme.border("│")} ${r}`);
    }

    lines.push(theme.border("─".repeat(rightInner)));
    lines.push(...breakdownLines);

    const statusBannerBox = renderBox({
        width: rightInner,
        borderColor: statusBannerColor,
        lines: [statusBannerText],
    });

    const contentTargetRows = Math.max(12, panelHeight - 2);
    while (lines.length + statusBannerBox.length < contentTargetRows) {
        lines.push("");
    }
    lines.push(...statusBannerBox);

    return lines;
}

export function renderMainMenuScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const isWide = width >= 96;

    const topStrip = renderHeaderStrip(width);
    const kpiStrip = isWide ? buildTopKpiStrip(state, width) : [];
    const workspaceHeight = Math.max(14, bodyRows - kpiStrip.length);

    let workspaceLines: string[];

    if (isWide) {
        const leftWidth = Math.max(38, Math.floor(width * 0.39));
        const rightWidth = width - leftWidth - 1;
        const leftInner = leftWidth - 4;
        const rightInner = rightWidth - 4;

        const useSpacers = workspaceHeight >= 24;
        const leftLines: string[] = [];

        for (let i = 0; i < TUI_MAIN_MENU_ITEMS.length; i++) {
            const item = TUI_MAIN_MENU_ITEMS[i];
            const selected = i === state.menuIndex;
            const num = `${i + 1}.`;
            const sub = MENU_DETAILS[item.id].shortSub;

            if (selected) {
                const subWidth = leftInner - 4;
                const row1 = theme.focusRow(
                    padRightVisible(`${theme.cyanBold(num)}  ${theme.whiteBold(item.label)}`, subWidth)
                );
                const row2 = theme.focusRow(
                    padRightVisible(`    ${theme.cyan(sub)}`, subWidth)
                );
                leftLines.push(
                    ...renderBox({
                        width: leftInner,
                        borderColor: theme.borderCyan,
                        lines: [row1, row2],
                    })
                );
            } else {
                const numColor =
                    item.id === "exit"
                        ? theme.rose
                        : item.id === "capacity-discovery"
                          ? theme.emerald
                          : item.id === "previous-reports"
                            ? theme.blue
                            : item.id === "configuration"
                              ? theme.purple
                              : theme.cyan;
                leftLines.push(
                    padRightVisible(
                        `  ${numColor(num)}  ${theme.whiteBold(item.label)}`,
                        leftInner
                    )
                );
                leftLines.push(
                    padRightVisible(`      ${theme.muted(sub)}`, leftInner)
                );
                if (useSpacers && i < TUI_MAIN_MENU_ITEMS.length - 1) {
                    leftLines.push("");
                }
            }
        }

        const leftBox = renderBox({
            title: theme.cyanBold("Main Menu"),
            rightTitle: theme.muted(`${state.menuIndex + 1}/${TUI_MAIN_MENU_ITEMS.length}`),
            width: leftWidth,
            height: workspaceHeight,
            borderColor: theme.border,
            lines: leftLines,
        });

        const rightBox = renderBox({
            width: rightWidth,
            height: workspaceHeight,
            borderColor: theme.border,
            lines: buildRightPanelLines(state, rightInner, workspaceHeight),
        });

        workspaceLines = renderSplitColumns(leftBox, rightBox, leftWidth, rightWidth, 1);
    } else {
        const inner = width - 4;
        const leftLines: string[] = [];
        for (let i = 0; i < TUI_MAIN_MENU_ITEMS.length; i++) {
            const item = TUI_MAIN_MENU_ITEMS[i];
            const selected = i === state.menuIndex;
            const num = `${i + 1}.`;
            const sub = MENU_DETAILS[item.id].shortSub;
            if (selected) {
                leftLines.push(
                    theme.focusRow(
                        padRightVisible(`${theme.cyanBold(num)}  ${theme.whiteBold(item.label)}`, inner)
                    )
                );
                leftLines.push(
                    theme.focusRow(padRightVisible(`    ${theme.cyan(sub)}`, inner))
                );
            } else {
                leftLines.push(
                    padRightVisible(`  ${theme.muted(num)}  ${theme.white(item.label)}`, inner)
                );
            }
        }

        workspaceLines = renderBox({
            title: theme.cyanBold("Main Menu"),
            width,
            height: workspaceHeight,
            borderColor: theme.borderCyan,
            lines: leftLines,
        });
    }

    const bottomBar = renderBottomBar(
        [
            ["↑↓", "Navigate"],
            ["Enter", "Select"],
            ["←→", "Tab"],
            ["1-6", "Jump"],
            ["Esc", "Exit"],
        ],
        state.statusMessage ?? "Press ? for help",
        width
    );

    return composeFullScreen(topStrip, [...kpiStrip, ...workspaceLines], bottomBar, size);
}
