import type { TerminalSize, TuiAppState } from "../../domain/tui-types.js";
import {
    composeFullScreen,
    getFullScreenDimensions,
    renderBottomBar,
    renderBox,
    renderSplitColumns,
    renderTopBar,
    wrapPlainText,
} from "../components/tui-primitives.js";
import { padRightVisible, theme } from "../theme/ansi-palette.js";

export function renderReportsHistoryScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const isWide = width >= 98;
    const listWidth = isWide ? Math.max(48, Math.floor(width * 0.56)) : width;
    const listInner = listWidth - 4;

    const listLines: string[] = [];
    if (state.savedReports.length === 0) {
        listLines.push("");
        listLines.push(
            theme.muted("  No saved reports yet. Run a load test or capacity discovery first.")
        );
    } else {
        const maxVisible = Math.max(5, bodyRows - 4);
        const start = Math.max(
            0,
            Math.min(
                state.historyIndex - Math.floor(maxVisible / 2),
                Math.max(0, state.savedReports.length - maxVisible)
            )
        );
        const visible = state.savedReports.slice(start, start + maxVisible);

        for (let i = 0; i < visible.length; i++) {
            const actualIdx = start + i;
            const entry = visible[i];
            const rec = entry.record;
            const tag =
                rec.kind === "capacity"
                    ? theme.purplePill(" CAP ")
                    : theme.tealPill(" LOAD ");
            const metric =
                rec.kind === "capacity"
                    ? `${rec.report.maxSafeConcurrency} safe (${rec.report.maxSafeRps.toFixed(1)} users/s)`
                    : `${rec.report.successfulRequests}/${rec.report.totalRequests} ok (${(rec.report.requestsPerSecond ?? 0).toFixed(1)} req/s)`;

            const focused = actualIdx === state.historyIndex;
            const marker = focused ? theme.cyanBold("▎") : " ";
            const rowText = `${marker} ${tag} ${theme.muted(rec.createdAt.slice(0, 19).replace("T", " "))}  ${theme.whiteBold(rec.method)} ${theme.white(rec.targetUrl)}  ${theme.cyanBold(metric)}`;
            const padded = padRightVisible(rowText, listInner);
            listLines.push(
                focused
                    ? theme.focusRow(padded)
                    : i % 2 === 1
                      ? theme.zebraRow(padded)
                      : padded
            );
        }
    }

    let bodyLines: string[];
    if (isWide) {
        const previewWidth = width - listWidth - 1;
        const previewInner = previewWidth - 4;
        const selected = state.savedReports[state.historyIndex];
        const previewLines: string[] = [];

        if (!selected) {
            previewLines.push(theme.muted("Select a report to inspect its metrics."));
        } else {
            const rec = selected.record;
            previewLines.push(
                rec.kind === "capacity"
                    ? theme.purpleBold("Capacity Discovery Run")
                    : theme.cyanBold("Load Test Run")
            );
            previewLines.push(
                ...wrapPlainText(`${rec.method} ${rec.targetUrl}`, previewInner).map((l) =>
                    theme.whiteBold(l)
                )
            );
            previewLines.push(theme.muted(rec.createdAt.slice(0, 19).replace("T", " ")));
            previewLines.push("");
            previewLines.push(theme.border("─".repeat(previewInner)));

            if (rec.kind === "capacity") {
                const r = rec.report;
                const modeLabel = r.mode === "burst" ? "Users/sec Spike" : "Steady Users";
                previewLines.push(
                    `${theme.muted("Mode:           ")} ${theme.white(`${modeLabel} (${r.stepDurationSeconds}s, ${r.stopPolicy})`)}`
                );
                previewLines.push(
                    `${theme.muted("Max Safe:       ")} ${theme.emeraldBold(`${r.maxSafeConcurrency} users`)}`
                );
                previewLines.push(
                    `${theme.muted("Delivered Rate: ")} ${theme.cyanBold(`${r.maxSafeRps.toFixed(1)} users/sec`)}`
                );
                previewLines.push(
                    `${theme.muted("Breaking Point: ")} ${
                        r.breakingConcurrency !== null
                            ? theme.roseBold(`${r.breakingConcurrency} users`)
                            : theme.emerald("Not hit")
                    }`
                );
                previewLines.push("");
                previewLines.push(
                    ...wrapPlainText(r.summary, previewInner).map((l) => theme.white(l))
                );
            } else {
                const r = rec.report;
                previewLines.push(
                    `${theme.muted("Requests:   ")} ${theme.emeraldBold(`${r.successfulRequests}/${r.totalRequests}`)}`
                );
                previewLines.push(
                    `${theme.muted("Throughput: ")} ${theme.cyanBold(`${(r.requestsPerSecond ?? 0).toFixed(1)} req/s`)}`
                );
                previewLines.push(
                    `${theme.muted("P95 Latency:")} ${theme.purpleBold(
                        r.latency.p95 !== null ? `${r.latency.p95.toFixed(1)} ms` : "--"
                    )}`
                );
                previewLines.push(
                    `${theme.muted("Failed:     ")} ${
                        r.failedRequests > 0
                            ? theme.roseBold(String(r.failedRequests))
                            : theme.emeraldBold("0")
                    }`
                );
            }

            previewLines.push("");
            previewLines.push(theme.muted("File Path"));
            previewLines.push(
                ...wrapPlainText(selected.filePath, previewInner).map((l) => theme.blue(l))
            );
        }

        const leftBox = renderBox({
            title: theme.cyanBold("Previous Reports"),
            rightTitle: theme.emeraldBold(`${state.savedReports.length} saved`),
            width: listWidth,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: listLines,
        });
        const rightBox = renderBox({
            title: theme.purpleBold("Report Preview"),
            width: previewWidth,
            height: bodyRows,
            borderColor: theme.borderPurple,
            lines: previewLines,
        });

        bodyLines = renderSplitColumns(leftBox, rightBox, listWidth, previewWidth, 1);
    } else {
        bodyLines = renderBox({
            title: theme.cyanBold("Previous Reports"),
            rightTitle: theme.emeraldBold(`${state.savedReports.length} saved`),
            width,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: listLines,
        });
    }

    const topBar = renderTopBar({
        breadcrumbs: ["Previous Reports"],
        statusLabel: `${state.savedReports.length} SAVED`,
        statusTone: "cyan",
        rightMeta: "Newest first",
        width,
    });

    const bottomBar = renderBottomBar(
        [
            ["↑↓", "Select"],
            ["Enter", "Open Full Report"],
            ["Esc", "Home"],
        ],
        "~/.loadforge/reports",
        width
    );

    return composeFullScreen(topBar, bodyLines, bottomBar, size);
}

export function renderConfigurationScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const isWide = width >= 94;
    const formWidth = isWide ? Math.max(54, Math.floor(width * 0.58)) : width;
    const formInner = formWidth - 4;
    const prefs = state.preferences;

    const rows: Array<{ label: string; value: string; hint: string; explain: string }> = [
        {
            label: "Default HTTP Method",
            value: prefs.defaultMethod,
            hint: "←/→ cycle",
            explain: "Default HTTP verb preselected when opening a new benchmark or capacity test.",
        },
        {
            label: "Default Concurrency",
            value: prefs.defaultConcurrency,
            hint: "auto or integer",
            explain: "Set 'auto' for adaptive concurrency scaling, or an integer for fixed parallel users.",
        },
        {
            label: "Default Timeout (ms)",
            value: prefs.defaultTimeout,
            hint: "auto or ms",
            explain: "Set 'auto' to calibrate timeout per target via RTT probe, or a fixed ms value.",
        },
        {
            label: "Discovery Window (s)",
            value: prefs.defaultWindowSeconds,
            hint: "seconds per step",
            explain: "Default window seconds per capacity test step (1s measures pure users/sec spikes).",
        },
        {
            label: "Discovery Mode",
            value: prefs.defaultCapacityMode === "burst" ? "burst (Users/sec Spike)" : "sustained (Steady Users)",
            hint: "←/→ toggle",
            explain: "Steady Users holds concurrency across W seconds; Users/sec Spike sends N users simultaneously per step.",
        },
        {
            label: "Auto-Save Reports",
            value: prefs.autoSaveReports ? "Enabled" : "Disabled",
            hint: "Space/Enter toggle",
            explain: "Automatically persist completed Load Test and Capacity reports to JSON.",
        },
        {
            label: "Save & Return",
            value: "",
            hint: "",
            explain: "Save your updated defaults to disk and return to the Home workspace.",
        },
    ];

    const panelLines: string[] = [
        theme.purpleBold("Default Test & Persistence Settings"),
        "",
    ];

    for (let i = 0; i < rows.length; i++) {
        const item = rows[i];
        const focused = i === state.configFocusIndex;
        const left = padRightVisible(item.label, 24);
        const marker = focused ? theme.cyanBold("▎") : " ";

        if (!item.value) {
            const btn = focused
                ? theme.emeraldPill("   Save & Return   ")
                : theme.tealPill("   Save & Return   ");
            panelLines.push("");
            panelLines.push(`  ${btn}`);
            continue;
        }

        const right = `${focused ? theme.cyanBold(item.value) : theme.emeraldBold(item.value)}  ${theme.muted(`(${item.hint})`)}`;
        const rowText = `${marker} ${focused ? theme.whiteBold(left) : theme.white(left)}  ${right}`;

        panelLines.push(
            focused
                ? theme.focusRow(padRightVisible(rowText, formInner))
                : rowText
        );
    }

    let bodyLines: string[];
    if (isWide) {
        const rightWidth = width - formWidth - 1;
        const rightInner = rightWidth - 4;
        const activeRow = rows[state.configFocusIndex] ?? rows[0];
        const sideLines: string[] = [
            theme.cyanBold("Focused Option"),
            theme.whiteBold(activeRow.label),
            "",
            ...wrapPlainText(activeRow.explain, rightInner).map((l) => theme.white(l)),
            "",
            theme.border("─".repeat(rightInner)),
            theme.purpleBold("Storage Location"),
            theme.blue("  ~/.loadforge/preferences.json"),
            theme.blue("  ~/.loadforge/reports/*.json"),
        ];

        const leftBox = renderBox({
            title: theme.cyanBold("Settings"),
            width: formWidth,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: panelLines,
        });
        const rightBox = renderBox({
            title: theme.purpleBold("Details"),
            width: rightWidth,
            height: bodyRows,
            borderColor: theme.borderPurple,
            lines: sideLines,
        });
        bodyLines = renderSplitColumns(leftBox, rightBox, formWidth, rightWidth, 1);
    } else {
        bodyLines = renderBox({
            title: theme.cyanBold("Settings"),
            width,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: panelLines,
        });
    }

    const topBar = renderTopBar({
        breadcrumbs: ["Settings"],
        statusLabel: "PREFERENCES",
        statusTone: "cyan",
        rightMeta: "~/.loadforge/preferences.json",
        width,
    });

    const bottomBar = renderBottomBar(
        [
            ["↑↓", "Navigate"],
            ["←→/Enter", "Change"],
            ["Ctrl+U", "Clear"],
            ["Esc", "Cancel"],
        ],
        "Persistent Profile",
        width
    );

    return composeFullScreen(topBar, bodyLines, bottomBar, size);
}

export function renderAboutScreen(
    _state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const isWide = width >= 96;

    const capabilities: string[] = [
        theme.emeraldBold("LoadForge — HTTP Load & Users/Sec Capacity Engine"),
        "",
        ...wrapPlainText(
            "Clean Architecture TypeScript engine compiled into a standalone Node v24 single executable binary with zero external runtime dependencies.",
            isWide ? Math.floor(width * 0.54) - 6 : width - 6
        ).map((l) => theme.white(l)),
        "",
        theme.cyanBold("Core Engine Modules"),
        `  ${theme.whiteBold("Adaptive Timeout (RFC 6298)")}`,
        `    ${theme.muted("Automatic baseline RTT + jitter variance calibration")}`,
        `  ${theme.whiteBold("Adaptive Concurrency (AIMD)")}`,
        `    ${theme.muted("Gradient2 + AIMD queuing latency backoff")}`,
        `  ${theme.whiteBold("Capacity Discovery (Users/sec Finder)")}`,
        `    ${theme.muted("Steady Users & Users/sec Spike modes + binary refinement")}`,
        `  ${theme.whiteBold("Backpressure Worker Pool")}`,
        `    ${theme.muted("Bounded FIFO task queue preventing client starvation")}`,
    ];

    let bodyLines: string[];
    if (isWide) {
        const leftWidth = Math.floor(width * 0.54);
        const rightWidth = width - leftWidth - 1;
        const rightLines: string[] = [
            theme.purpleBold("CLI Automation Reference"),
            "",
            theme.whiteBold("Load Benchmark:"),
            theme.amberBold("  loadforge run -u https://api.example.com -d 10"),
            theme.amberBold("  loadforge run -u https://api.example.com -n 1000 -c 50"),
            "",
            theme.whiteBold("Users/Sec Capacity Discovery:"),
            theme.amberBold("  loadforge discover -u https://api.example.com --mode burst -w 1"),
            theme.amberBold("  loadforge discover -u https://api.example.com -w 5 --until-limit"),
            "",
            theme.cyanBold("Telemetry & Persistence"),
            theme.muted("  Streaming:  2x4 Unicode Braille @ 200ms ticks"),
            theme.blue("  Reports:    ~/.loadforge/reports/*.json"),
            theme.blue("  Config:     ~/.loadforge/preferences.json"),
        ];

        const leftBox = renderBox({
            title: theme.cyanBold("Architecture"),
            width: leftWidth,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: capabilities,
        });
        const rightBox = renderBox({
            title: theme.purpleBold("CLI & Runtime"),
            width: rightWidth,
            height: bodyRows,
            borderColor: theme.borderPurple,
            lines: rightLines,
        });
        bodyLines = renderSplitColumns(leftBox, rightBox, leftWidth, rightWidth, 1);
    } else {
        bodyLines = renderBox({
            title: theme.cyanBold("About LoadForge"),
            width,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: [
                ...capabilities,
                "",
                theme.purpleBold("CLI Automation"),
                theme.amberBold("  loadforge run -u https://api.example.com -d 10"),
                theme.amberBold("  loadforge discover -u https://api.example.com --mode burst -w 1"),
            ],
        });
    }

    const topBar = renderTopBar({
        breadcrumbs: ["About"],
        statusLabel: "v1.0.0",
        statusTone: "cyan",
        rightMeta: "Node SEA Runtime",
        width,
    });

    const bottomBar = renderBottomBar(
        [["Enter / Esc", "Back to Home"]],
        "LoadForge v1.0.0",
        width
    );

    return composeFullScreen(topBar, bodyLines, bottomBar, size);
}
