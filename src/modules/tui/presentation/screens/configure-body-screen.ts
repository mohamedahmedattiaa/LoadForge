import {
    TUI_BODY_SOURCES,
    validateJsonBody,
} from "../../domain/tui-state-service.js";
import type {
    TerminalSize,
    TuiAppState,
    TuiBodySource,
} from "../../domain/tui-types.js";
import {
    composeFullScreen,
    getFullScreenDimensions,
    renderBottomBar,
    renderBox,
    renderMethodPills,
    renderSplitColumns,
    renderTopBar,
} from "../components/tui-primitives.js";
import { padRightVisible, theme } from "../theme/ansi-palette.js";

const BODY_LABELS: Record<TuiBodySource, string> = {
    manual: "Enter JSON manually",
    file: "Load from file",
    editor: "Open in external editor ($EDITOR)",
    skip: "Skip request body",
};

function colorizeJsonLine(raw: string): string {
    const keyMatch = raw.match(/^(\s*)("[^"]+")(\s*:\s*)(.*)$/);
    if (keyMatch) {
        const [, indent, key, colon, value] = keyMatch;
        return `${indent}${theme.cyan(key)}${theme.muted(colon)}${theme.amber(value)}`;
    }
    return theme.white(raw);
}

export function renderConfigureBodyScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const isWide = width >= 96;
    const { form, bodyFocusIndex } = state;

    const buildMethodAndSource = (panelInner: number): string[] => {
        const lines: string[] = [];
        const methodFocus = bodyFocusIndex === 0;
        lines.push(
            methodFocus ? theme.cyanBold("▎ HTTP Method") : theme.muted("  HTTP Method")
        );
        lines.push(`  ${renderMethodPills(form.method)}`);
        lines.push("");

        const sourceFocus = bodyFocusIndex === 1;
        lines.push(
            sourceFocus ? theme.cyanBold("▎ Payload Source") : theme.muted("  Payload Source")
        );

        for (let i = 0; i < TUI_BODY_SOURCES.length; i++) {
            const src = TUI_BODY_SOURCES[i];
            const active = form.bodySource === src;
            const highlighted = sourceFocus && i === state.bodyOptionIndex;
            const radio = active ? theme.cyanBold("●") : theme.muted("○");
            const label = BODY_LABELS[src];
            const text = `${highlighted ? theme.cyanBold("▎") : " "} ${radio} ${
                highlighted ? theme.whiteBold(label) : theme.white(label)
            }`;
            lines.push(
                highlighted ? theme.focusRow(padRightVisible(text, panelInner)) : text
            );
        }

        lines.push("");
        const continueFocus = bodyFocusIndex === 3;
        const ctaText = continueFocus
            ? theme.emeraldPill("   Save & Return   ")
            : theme.activePill("   Save & Return   ");
        lines.push(`  ${ctaText}`);

        if (state.validationError) {
            lines.push("");
            lines.push(theme.roseBold(`  Error: ${state.validationError}`));
        }
        return lines;
    };

    const buildPayloadPane = (panelInner: number, maxPreviewLines: number): string[] => {
        const lines: string[] = [];
        if (form.bodySource === "file") {
            const fileFocus = bodyFocusIndex === 2;
            lines.push(
                fileFocus
                    ? theme.cyanBold("▎ File Path (Enter loads file)")
                    : theme.muted("  File Path")
            );
            lines.push(
                ...renderBox({
                    width: panelInner,
                    borderColor: fileFocus ? theme.cyan : theme.border,
                    lines: [
                        form.bodyFilePath.length > 0
                            ? theme.white(form.bodyFilePath) + (fileFocus ? theme.cyan("▌") : "")
                            : theme.muted("./payload.json") + (fileFocus ? theme.cyan("▌") : ""),
                    ],
                })
            );
            lines.push("");
            lines.push(theme.muted("  Supported: UTF-8 JSON payload files"));
        } else if (form.bodySource !== "skip") {
            const editorFocus = bodyFocusIndex === 2;
            const allLines = form.bodyText.split("\n");
            const bodyLines = allLines.slice(-maxPreviewLines);
            const lineStart = Math.max(1, allLines.length - bodyLines.length + 1);
            const formattedCode = bodyLines.map((line, idx) => {
                const num = theme.muted(`${String(lineStart + idx).padStart(2, " ")} │ `);
                const cursor =
                    editorFocus && idx === bodyLines.length - 1
                        ? theme.cyan("▌")
                        : "";
                return `${num}${colorizeJsonLine(line)}${cursor}`;
            });

            lines.push(
                editorFocus
                    ? theme.cyanBold("▎ JSON Payload")
                    : theme.muted("  JSON Payload")
            );
            lines.push(
                ...renderBox({
                    width: panelInner,
                    borderColor: editorFocus ? theme.cyan : theme.border,
                    lines: formattedCode,
                })
            );

            const validation = validateJsonBody(form.bodyText);
            lines.push(
                validation.ok
                    ? theme.emerald("  Valid JSON  ·  Auto Content-Type: application/json")
                    : theme.rose(`  Invalid JSON: ${validation.message}`)
            );
        } else {
            lines.push(theme.muted("  No request body will be sent."));
            lines.push("");
            lines.push(theme.muted("  Select 'Enter JSON manually' to attach a body."));
        }
        return lines;
    };

    let bodyLines: string[];
    if (isWide) {
        const leftWidth = Math.max(44, Math.floor(width * 0.46));
        const rightWidth = width - leftWidth - 1;
        const leftBox = renderBox({
            title: theme.whiteBold("Request Body Source"),
            rightTitle: theme.cyan(form.method),
            width: leftWidth,
            height: bodyRows,
            borderColor: theme.borderActive,
            lines: buildMethodAndSource(leftWidth - 4),
        });
        const rightBox = renderBox({
            title: theme.whiteBold("Payload Editor & Validation"),
            rightTitle: theme.muted(form.bodySource),
            width: rightWidth,
            height: bodyRows,
            borderColor: theme.border,
            lines: buildPayloadPane(rightWidth - 4, Math.max(5, bodyRows - 8)),
        });
        bodyLines = renderSplitColumns(leftBox, rightBox, leftWidth, rightWidth, 1);
    } else {
        const inner = width - 4;
        const combined = [
            ...buildMethodAndSource(inner).slice(0, -2),
            "",
            ...buildPayloadPane(inner, 4),
            "",
            ...buildMethodAndSource(inner).slice(-2),
        ];
        bodyLines = renderBox({
            title: theme.whiteBold("Request Body"),
            width,
            height: bodyRows,
            borderColor: theme.borderActive,
            lines: combined,
        });
    }

    const topBar = renderTopBar({
        breadcrumbs: ["Configure", "Request Body"],
        statusLabel: form.method,
        statusTone: "cyan",
        rightMeta: form.bodySource,
        width,
    });

    const bottomBar = renderBottomBar(
        [
            ["↑↓/Tab", "Section"],
            ["←→", "Method"],
            ["Enter", "Select / Save"],
            ["Esc", "Back"],
        ],
        "JSON / File / $EDITOR",
        width
    );

    return composeFullScreen(topBar, bodyLines, bottomBar, size);
}
