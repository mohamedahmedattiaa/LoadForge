import {
    getSetOptionsFieldOrder,
    validateJsonBody,
    type SetOptionsFieldId,
} from "../../domain/tui-state-service.js";
import type { TerminalSize, TuiAppState } from "../../domain/tui-types.js";
import {
    composeFullScreen,
    getFullScreenDimensions,
    renderBottomBar,
    renderBox,
    renderMethodPills,
    renderSplitColumns,
    renderTopBar,
    wrapPlainText,
} from "../components/tui-primitives.js";
import { padRightVisible, theme } from "../theme/ansi-palette.js";

const FIELD_CONTEXT_TIPS: Record<SetOptionsFieldId, string> = {
    url: "Start typing your target URL to replace the placeholder, or press Ctrl+U to clear it right away.",
    method: "Press ← / → or Enter to pick the HTTP method. POST, PUT, and PATCH unlock Request Body options.",
    "edit-body": "Press Enter to open the JSON / File / External Editor payload composer.",
    "test-kind":
        "Load Test runs one fixed traffic benchmark. Capacity Discovery finds the maximum users/sec your server holds safely.",
    "stop-condition":
        "Stop either after a fixed number of requests or after a duration in seconds.",
    requests: "Total number of HTTP requests to send across active workers.",
    duration: "Test length in seconds (10s or longer produces smooth live charts).",
    concurrency: "How many virtual users run at the same time (integer like 25, or 'auto').",
    "capacity-mode":
        "Users/sec Spike (Burst) sends N users together in each window to test how many users/sec you handle. Steady Users holds N active users across the window.",
    "until-limit":
        "Latency + Error SLO stops as soon as responses get slow or errors > 2%. Until Rejection keeps pushing until HTTP 429/5xx or timeouts > 2%.",
    "capacity-window":
        "Window length in seconds per step. Use 1s to measure pure users/sec spikes, or 2–5s for steadier averages.",
    "start-concurrency": "Initial users tested in Step 1 (escalates smoothly upward from here).",
    "max-concurrency": "Safety ceiling where Capacity Discovery stops even if the server never fails.",
    "max-p95":
        "Optional custom slowest-acceptable P95 latency in ms (leave blank for automatic 4x baseline).",
    timeout: "Request timeout limit in ms, or 'auto' to calibrate automatically before starting.",
    "add-header":
        "Press Enter, type 'Key: Value', then press Enter again. Backspace removes the last header.",
    "start-test": "Press Enter here—or Ctrl+R from any field—to start the test immediately.",
};

function summarizeBodyState(state: TuiAppState): string {
    const { form } = state;
    if (form.bodySource === "skip") {
        return theme.muted("None  (Enter to add)");
    }

    const valid = validateJsonBody(form.bodyText);
    const lineCount = form.bodyText.split("\n").length;
    const badge = valid.ok
        ? theme.emeraldBold("valid")
        : theme.roseBold("invalid");
    return `${theme.white(`${lineCount} line${lineCount === 1 ? "" : "s"}`)} ${theme.muted("·")} ${badge}  ${theme.muted("(Enter to edit)")}`;
}

function buildCliPreview(state: TuiAppState): string {
    const { form } = state;
    const url = form.url.trim() || "https://api.example.com";
    const parts: string[] = ["loadforge"];

    if (form.testKind === "capacity") {
        parts.push("discover", "-u", url);
        if (form.method !== "GET") {
            parts.push("-m", form.method);
        }
        parts.push("--mode", form.capacityMode);
        parts.push("-w", form.capacityWindowSeconds || "2");
        if (form.untilLimit) {
            parts.push("--until-limit");
        }
        if (form.timeout !== "auto") {
            parts.push("--timeout", form.timeout);
        }
    } else {
        parts.push("run", "-u", url);
        if (form.method !== "GET") {
            parts.push("-m", form.method);
        }
        if (form.stopCondition === "requests") {
            parts.push("-n", form.requests || "500");
        } else {
            parts.push("-d", form.duration || "10");
        }
        if (form.concurrency !== "auto") {
            parts.push("-c", form.concurrency);
        }
        if (form.timeout !== "auto") {
            parts.push("-t", form.timeout);
        }
    }

    return parts.join(" ");
}

export function renderSetOptionsScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const isWide = width >= 100;
    const formWidth = isWide ? Math.max(58, Math.floor(width * 0.58)) : width;
    const formInner = formWidth - 4;
    const { form } = state;
    const fields = getSetOptionsFieldOrder(form);
    const activeField: SetOptionsFieldId =
        fields[Math.min(state.optionsFocusIndex, fields.length - 1)] ?? "url";

    const modeTitle =
        form.testKind === "capacity" ? "Capacity Discovery" : "Load Test";

    const panelLines: string[] = [];
    const labelCol = 19;

    const addSectionTitle = (title: string): void => {
        if (panelLines.length > 0) {
            panelLines.push("");
        }
        panelLines.push(`  ${theme.purpleBold(title)}`);
    };

    const renderInputRow = (
        id: SetOptionsFieldId,
        label: string,
        valueDisplay: string,
        pristine = false
    ): void => {
        const focused = activeField === id;
        const labelStr = padRightVisible(label, labelCol);
        const prefix = focused
            ? `${theme.cyanBold("▎")} ${theme.whiteBold(labelStr)}`
            : `  ${theme.muted(labelStr)}`;
        const valStyled = pristine
            ? theme.muted(valueDisplay || "(empty)")
            : focused
              ? theme.cyanBold(valueDisplay)
              : theme.white(valueDisplay || "(auto)");
        const cursor = focused ? theme.cyanBold("▌") : "";
        const row = `${prefix}  ${valStyled}${cursor}`;
        panelLines.push(
            focused ? theme.focusRow(padRightVisible(row, formInner)) : row
        );
    };

    const renderSegmentedRow = (
        id: SetOptionsFieldId,
        label: string,
        pills: string
    ): void => {
        const focused = activeField === id;
        const labelStr = padRightVisible(label, labelCol);
        const prefix = focused
            ? `${theme.cyanBold("▎")} ${theme.whiteBold(labelStr)}`
            : `  ${theme.muted(labelStr)}`;
        const row = `${prefix}  ${pills}`;
        panelLines.push(
            focused ? theme.focusRow(padRightVisible(row, formInner)) : row
        );
    };

    addSectionTitle("ENDPOINT & MODE");

    for (const fieldId of fields) {
        switch (fieldId) {
            case "url":
                renderInputRow("url", "Target URL", form.url, form.urlPristine);
                break;

            case "method":
                renderSegmentedRow(
                    "method",
                    "HTTP Method",
                    renderMethodPills(form.method)
                );
                break;

            case "edit-body":
                renderSegmentedRow(
                    "edit-body",
                    "Request Body",
                    summarizeBodyState(state)
                );
                break;

            case "test-kind": {
                const kindPills =
                    form.testKind === "load-test"
                        ? `${theme.activePill(" Load Test ")}  ${theme.muted("Capacity Discovery")}`
                        : `${theme.muted("Load Test")}  ${theme.purplePill(" Capacity Discovery ")}`;
                renderSegmentedRow("test-kind", "Test Mode", kindPills);
                addSectionTitle(
                    form.testKind === "capacity"
                        ? "USERS / SEC DISCOVERY SETTINGS"
                        : "WORKLOAD SETTINGS"
                );
                break;
            }

            case "stop-condition": {
                const stopPills =
                    form.stopCondition === "requests"
                        ? `${theme.activePill(" Requests ")}  ${theme.muted("Duration (s)")}`
                        : `${theme.muted("Requests")}  ${theme.activePill(" Duration (s) ")}`;
                renderSegmentedRow("stop-condition", "Stop By", stopPills);
                break;
            }

            case "requests":
                renderInputRow("requests", "Total Requests", form.requests);
                break;

            case "duration":
                renderInputRow("duration", "Duration (sec)", form.duration);
                break;

            case "concurrency":
                renderInputRow("concurrency", "Concurrent Users", form.concurrency);
                break;

            case "capacity-mode": {
                const capPills =
                    form.capacityMode === "sustained"
                        ? `${theme.activePill(" Steady Users ")}  ${theme.muted("Users/sec Spike")}`
                        : `${theme.muted("Steady Users")}  ${theme.tealPill(" Users/sec Spike ")}`;
                renderSegmentedRow("capacity-mode", "Discovery Mode", capPills);
                break;
            }

            case "until-limit": {
                const policyPills = form.untilLimit
                    ? `${theme.muted("Latency + Error SLO")}  ${theme.amberPill(" Until Rejection ")}`
                    : `${theme.emeraldPill(" Latency + Error SLO ")}  ${theme.muted("Until Rejection")}`;
                renderSegmentedRow("until-limit", "Stop Policy", policyPills);
                break;
            }

            case "capacity-window":
                renderInputRow(
                    "capacity-window",
                    "Step Window (sec)",
                    form.capacityWindowSeconds
                );
                break;

            case "start-concurrency":
                renderInputRow(
                    "start-concurrency",
                    "Start Users",
                    form.startConcurrency
                );
                break;

            case "max-concurrency":
                renderInputRow(
                    "max-concurrency",
                    "Max Users",
                    form.maxConcurrency
                );
                break;

            case "max-p95":
                renderInputRow(
                    "max-p95",
                    "Max P95 (ms)",
                    form.maxP95Ms || "(auto SLO)",
                    form.maxP95Ms.length === 0
                );
                break;

            case "timeout":
                addSectionTitle("TIMING & HEADERS");
                renderInputRow("timeout", "Timeout (ms)", form.timeout);
                break;

            case "add-header": {
                const headerHint = state.isAddingHeader
                    ? `${theme.amberBold("New Header: ")}${theme.whiteBold(state.headerEditDraft)}${theme.cyanBold("▌")}`
                    : form.headers.length === 0
                      ? theme.muted("None  (Enter to add Key: Value)")
                      : form.headers
                            .map((h) => `${theme.cyan(h.key)}: ${theme.white(h.value)}`)
                            .join(", ");
                renderSegmentedRow("add-header", "Headers", headerHint);
                break;
            }

            case "start-test": {
                panelLines.push("");
                const startFocused = activeField === "start-test";
                const ctaLabel = startFocused
                    ? theme.emeraldPill("   Start Test   ")
                    : theme.tealPill("   Start Test   ");
                panelLines.push(
                    `  ${ctaLabel}   ${theme.muted("or press Ctrl+R anytime")}`
                );
                break;
            }
        }
    }

    if (state.validationError) {
        panelLines.push("");
        panelLines.push(
            ...wrapPlainText(`Error: ${state.validationError}`, formInner - 2).map(
                (l) => theme.roseBold(`  ${l}`)
            )
        );
    }

    let bodyLines: string[];

    if (isWide) {
        const rightWidth = width - formWidth - 1;
        const rightInner = rightWidth - 4;
        const inspectorLines: string[] = [];

        inspectorLines.push(theme.cyanBold("Target Request"));
        inspectorLines.push(
            ...wrapPlainText(
                `${form.method} ${form.url.trim() || "(unset)"}`,
                rightInner
            ).map((l, idx) =>
                idx === 0 ? theme.whiteBold(l) : `  ${theme.white(l)}`
            )
        );
        inspectorLines.push(
            `${theme.muted("Headers:")} ${theme.white(String(form.headers.length))}   ${theme.muted("Body:")} ${
                form.method === "GET" || form.method === "HEAD" || form.bodySource === "skip"
                    ? theme.muted("None")
                    : theme.emeraldBold("Attached")
            }`
        );

        inspectorLines.push("");
        inspectorLines.push(theme.border("─".repeat(rightInner)));
        inspectorLines.push(theme.cyanBold("What This Will Measure"));

        if (form.testKind === "capacity") {
            const win = form.capacityWindowSeconds || "2";
            const modeExplain =
                form.capacityMode === "burst"
                    ? `Sends N simultaneous users together in ${win}s windows to find the exact max users/sec your server handles cleanly.`
                    : `Holds N continuous concurrent users for ${win}s per step to measure steady sustainable concurrency & req/s.`;
            inspectorLines.push(
                ...wrapPlainText(modeExplain, rightInner).map((l) => theme.emerald(l))
            );
            inspectorLines.push("");
            inspectorLines.push(
                `${theme.muted("Range:  ")} ${theme.whiteBold(`${form.startConcurrency} → ${form.maxConcurrency} users`)}`
            );
            inspectorLines.push(
                `${theme.muted("Policy: ")} ${form.untilLimit ? theme.amberBold("Until Rejection (ignores slowdowns)") : theme.emeraldBold("Latency + Error SLO (fast & clean)")}`
            );
        } else {
            inspectorLines.push(
                `${theme.muted("Stop By: ")} ${theme.whiteBold(form.stopCondition === "requests" ? `${form.requests} total requests` : `${form.duration}s duration`)}`
            );
            inspectorLines.push(
                `${theme.muted("Users:   ")} ${theme.white(form.concurrency === "auto" ? "Adaptive AIMD (auto)" : `${form.concurrency} parallel users`)}`
            );
            inspectorLines.push(
                `${theme.muted("Timeout: ")} ${theme.white(form.timeout === "auto" ? "Automatic RTT probe" : `${form.timeout} ms`)}`
            );
        }

        inspectorLines.push("");
        inspectorLines.push(theme.border("─".repeat(rightInner)));
        inspectorLines.push(theme.cyanBold("Equivalent CLI"));
        inspectorLines.push(
            ...wrapPlainText(buildCliPreview(state), rightInner).map((l) =>
                theme.amberBold(l)
            )
        );

        inspectorLines.push("");
        inspectorLines.push(theme.border("─".repeat(rightInner)));
        inspectorLines.push(theme.purpleBold("Helpful Tip"));
        inspectorLines.push(
            ...wrapPlainText(FIELD_CONTEXT_TIPS[activeField], rightInner).map((l) =>
                theme.cyan(l)
            )
        );

        const leftBox = renderBox({
            title: theme.cyanBold(`Configure ${modeTitle}`),
            rightTitle: theme.muted(`${fields.length} options`),
            width: formWidth,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: panelLines,
        });

        const rightBox = renderBox({
            title: theme.purpleBold("Live Preview & Explanation"),
            rightTitle: theme.cyan(modeTitle),
            width: rightWidth,
            height: bodyRows,
            borderColor: theme.borderPurple,
            lines: inspectorLines,
        });

        bodyLines = renderSplitColumns(leftBox, rightBox, formWidth, rightWidth, 1);
    } else {
        const tipLines = wrapPlainText(FIELD_CONTEXT_TIPS[activeField], formInner).map((l) =>
            theme.cyan(l)
        );
        panelLines.push("");
        panelLines.push(theme.border("─".repeat(formInner)));
        panelLines.push(...tipLines);

        bodyLines = renderBox({
            title: theme.cyanBold(`Configure ${modeTitle}`),
            width: formWidth,
            height: bodyRows,
            borderColor: theme.borderCyan,
            lines: panelLines,
        });
    }

    const topBar = renderTopBar({
        breadcrumbs: ["Configure", modeTitle],
        statusLabel: "CONFIG",
        statusTone: "cyan",
        rightMeta: "Ctrl+R Run",
        width,
    });

    const bottomBar = renderBottomBar(
        [
            ["↑↓/Tab", "Field"],
            ["←→/Enter", "Toggle"],
            ["Ctrl+U", "Clear"],
            ["Ctrl+R", "Run"],
            ["Esc", "Home"],
        ],
        `${form.method} ${form.testKind === "capacity" ? "Capacity" : "Load"}`,
        width
    );

    return composeFullScreen(topBar, bodyLines, bottomBar, size);
}
