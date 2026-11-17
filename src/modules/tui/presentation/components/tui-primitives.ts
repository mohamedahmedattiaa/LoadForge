import { TUI_HTTP_METHODS } from "../../domain/tui-state-service.js";
import type { TerminalSize } from "../../domain/tui-types.js";
import {
    padCenterVisible,
    padRightVisible,
    theme,
    truncateVisible,
    visibleLength,
} from "../theme/ansi-palette.js";
import type { HttpMethod } from "../../../http/domain/http-types.js";

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export interface BoxOptions {
    title?: string;
    rightTitle?: string;
    lines: string[];
    width: number;
    height?: number;
    borderColor?: (s: string) => string;
    paddingX?: number;
}

export function renderBox(options: BoxOptions): string[] {
    const width = Math.max(12, options.width);
    const paddingX = options.paddingX ?? 1;
    const borderFn = options.borderColor ?? theme.border;
    const innerWidth = width - 2 - paddingX * 2;
    const padStr = " ".repeat(paddingX);

    let topBorder: string;
    if (options.title && options.rightTitle) {
        const rightChunk = ` ${truncateVisible(options.rightTitle, Math.max(4, Math.floor((width - 6) * 0.4)))} `;
        const maxLeftTitle = Math.max(4, width - 5 - visibleLength(rightChunk) - 2);
        const leftChunk = ` ${truncateVisible(options.title, maxLeftTitle)} `;
        const middleFill = Math.max(
            1,
            width - 4 - visibleLength(leftChunk) - visibleLength(rightChunk)
        );
        topBorder =
            borderFn("╭─") +
            leftChunk +
            borderFn("─".repeat(middleFill)) +
            rightChunk +
            borderFn("─╮");
    } else if (options.title) {
        const safeTitle = truncateVisible(options.title, Math.max(4, width - 5));
        const titleChunk = ` ${safeTitle} `;
        const remaining = Math.max(0, width - 3 - visibleLength(titleChunk));
        topBorder =
            borderFn("╭─") + titleChunk + borderFn(`${"─".repeat(remaining)}╮`);
    } else {
        topBorder = borderFn(`╭${"─".repeat(width - 2)}╮`);
    }

    const paddedLines = [...options.lines];
    if (options.height !== undefined && options.height > 2) {
        const targetBodyRows = options.height - 2;
        while (paddedLines.length < targetBodyRows) {
            paddedLines.push("");
        }
        if (paddedLines.length > targetBodyRows) {
            paddedLines.length = targetBodyRows;
        }
    }

    const body = paddedLines.map((line) => {
        const padded = padRightVisible(line, innerWidth);
        return `${borderFn("│")}${padStr}${padded}${padStr}${borderFn("│")}`;
    });

    const bottomBorder = borderFn(`╰${"─".repeat(width - 2)}╯`);

    return [topBorder, ...body, bottomBorder];
}

export function renderHorizontalBoxes(
    columns: string[][],
    gap: number = 1
): string[] {
    if (columns.length === 0) {
        return [];
    }

    const maxRows = Math.max(...columns.map((c) => c.length));
    const colWidths = columns.map((c) =>
        c.length > 0 ? visibleLength(c[0]) : 0
    );
    const spacer = " ".repeat(gap);
    const result: string[] = [];

    for (let row = 0; row < maxRows; row++) {
        const parts: string[] = [];
        for (let col = 0; col < columns.length; col++) {
            const cell = columns[col][row] ?? " ".repeat(colWidths[col]);
            parts.push(padRightVisible(cell, colWidths[col]));
        }
        result.push(parts.join(spacer));
    }

    return result;
}

export function renderProgressBar(ratio: number, barWidth: number): string {
    const clamped = Math.max(0, Math.min(1, ratio));
    const filled = Math.round(clamped * barWidth);
    const empty = Math.max(0, barWidth - filled);
    return `${theme.emerald("█".repeat(filled))}${theme.border("░".repeat(empty))}`;
}

export function renderSparkline(
    values: readonly number[],
    width: number,
    colorFn: (s: string) => string = theme.cyan
): string {
    if (width <= 0) {
        return "";
    }

    const slice = values.slice(-width);
    if (slice.length === 0) {
        return theme.dim("·".repeat(width));
    }

    const max = Math.max(...slice, 1e-6);
    const min = Math.min(...slice);
    const span = Math.max(max - min, 1e-6);

    const bars = slice
        .map((v) => {
            const norm = max === min ? 0.5 : (v - min) / span;
            const idx = Math.min(
                SPARK_CHARS.length - 1,
                Math.max(0, Math.round(norm * (SPARK_CHARS.length - 1)))
            );
            return colorFn(SPARK_CHARS[idx]);
        })
        .join("");

    const leading = " ".repeat(Math.max(0, width - slice.length));
    return `${leading}${bars}`;
}

const BRAILLE_DOT_BITS: readonly (readonly [number, number])[] = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
];

function setBraillePixel(
    canvas: Uint8Array,
    cols: number,
    px: number,
    py: number,
    pxWidth: number,
    pxHeight: number
): void {
    if (px < 0 || px >= pxWidth || py < 0 || py >= pxHeight) {
        return;
    }
    const cellX = Math.floor(px / 2);
    const cellY = Math.floor(py / 4);
    const bit = BRAILLE_DOT_BITS[py % 4][px % 2];
    canvas[cellY * cols + cellX] |= bit;
}

function drawBrailleLine(
    canvas: Uint8Array,
    cols: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    pxWidth: number,
    pxHeight: number
): void {
    let cx = Math.round(x0);
    let cy = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - cx);
    const dy = Math.abs(ty - cy);
    const sx = cx < tx ? 1 : -1;
    const sy = cy < ty ? 1 : -1;
    let err = dx - dy;

    while (true) {
        setBraillePixel(canvas, cols, cx, cy, pxWidth, pxHeight);
        if (cx === tx && cy === ty) {
            break;
        }
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            cx += sx;
        }
        if (e2 < dx) {
            err += dx;
            cy += sy;
        }
    }
}

function plotSeriesToBraille(
    canvas: Uint8Array,
    cols: number,
    rows: number,
    values: readonly number[],
    maxVal: number
): void {
    if (values.length === 0) {
        return;
    }
    const pxWidth = cols * 2;
    const pxHeight = rows * 4;
    const pxStep = 3;
    const maxVisibleSamples = Math.max(2, Math.floor((pxWidth - 1) / pxStep) + 1);
    const slice = values.slice(-maxVisibleSamples);

    const mapY = (val: number): number => {
        const clamped = Math.max(0, Math.min(1, val / maxVal));
        return Math.round((1 - clamped) * (pxHeight - 1));
    };

    const mapX = (index: number, total: number): number => {
        if (total <= maxVisibleSamples) {
            return Math.min(pxWidth - 1, index * pxStep);
        }
        return Math.round((index / Math.max(1, total - 1)) * (pxWidth - 1));
    };

    if (slice.length === 1) {
        const y = mapY(slice[0]);
        drawBrailleLine(canvas, cols, 0, y, 2, y, pxWidth, pxHeight);
        return;
    }

    const total = slice.length;
    for (let i = 0; i < total - 1; i++) {
        const x0 = mapX(i, total);
        const x1 = mapX(i + 1, total);
        const y0 = mapY(slice[i]);
        const y1 = mapY(slice[i + 1]);
        drawBrailleLine(canvas, cols, x0, y0, x1, y1, pxWidth, pxHeight);
    }
}

/**
 * Renders a compact multi-row Unicode Braille curve sized to fit inside a KPI card.
 */
export function renderMiniBrailleCurve(
    values: readonly number[],
    cols: number,
    rows: number = 2,
    colorFn: (s: string) => string = theme.cyan
): string[] {
    const plotWidth = Math.max(8, cols);
    const plotHeight = Math.max(1, rows);
    if (values.length === 0) {
        return Array.from({ length: plotHeight }, (_, r) =>
            r === plotHeight - 1
                ? theme.border("─".repeat(plotWidth))
                : " ".repeat(plotWidth)
        );
    }

    const normalized =
        values.length === 1 ? [values[0], values[0]] : values;
    const minVal = Math.min(...normalized);
    const maxVal = Math.max(...normalized);
    const span = Math.max(maxVal - minVal, 1e-6);
    const shifted = normalized.map((v) =>
        maxVal === minVal ? 0.55 : 0.12 + ((v - minVal) / span) * 0.85
    );

    const canvas = new Uint8Array(plotWidth * plotHeight);
    const pxWidth = plotWidth * 2;
    const pxHeight = plotHeight * 4;
    const total = shifted.length;

    for (let i = 0; i < total - 1; i++) {
        const x0 = Math.round((i / (total - 1)) * (pxWidth - 1));
        const x1 = Math.round(((i + 1) / (total - 1)) * (pxWidth - 1));
        const y0 = Math.round((1 - shifted[i]) * (pxHeight - 1));
        const y1 = Math.round((1 - shifted[i + 1]) * (pxHeight - 1));
        drawBrailleLine(canvas, plotWidth, x0, y0, x1, y1, pxWidth, pxHeight);
    }

    const out: string[] = [];
    for (let r = 0; r < plotHeight; r++) {
        let rowStr = "";
        for (let c = 0; c < plotWidth; c++) {
            const bits = canvas[r * plotWidth + c];
            rowStr += bits === 0 ? " " : colorFn(String.fromCharCode(0x2800 + bits));
        }
        out.push(rowStr);
    }
    return out;
}

/**
 * Renders a high-resolution 2x4 Unicode Braille dual-series live chart (RPS + P95 Latency).
 */
export function renderDualSeriesChart(params: {
    width: number;
    height: number;
    rpsValues: readonly number[];
    latencyValues: readonly number[];
}): string[] {
    const plotHeight = Math.max(5, params.height);
    const axisLeftWidth = 6;
    const axisRightWidth = 7;
    const plotWidth = Math.max(18, params.width - axisLeftWidth - axisRightWidth - 2);

    const rpsSlice = params.rpsValues.slice(-(plotWidth * 2));
    const latSlice = params.latencyValues.slice(-(plotWidth * 2));

    const maxRps = Math.max(10, ...rpsSlice) * 1.1;
    const maxLat = Math.max(50, ...latSlice) * 1.1;

    const rpsCanvas = new Uint8Array(plotWidth * plotHeight);
    const latCanvas = new Uint8Array(plotWidth * plotHeight);

    plotSeriesToBraille(rpsCanvas, plotWidth, plotHeight, rpsSlice, maxRps);
    plotSeriesToBraille(latCanvas, plotWidth, plotHeight, latSlice, maxLat);

    const midRow = Math.floor(plotHeight / 2);
    const lines: string[] = [];
    const latestRps = rpsSlice.length > 0 ? `${rpsSlice[rpsSlice.length - 1].toFixed(1)} req/s` : "--";
    const latestLat = latSlice.length > 0 ? `${Math.round(latSlice[latSlice.length - 1])} ms` : "--";
    const axisNote = params.width >= 76 ? "(left: req/s | right: ms)" : "(L: req/s · R: ms)";
    lines.push(
        `${theme.cyanBold("●")} ${theme.white("Throughput:")} ${theme.cyanBold(latestRps)}   ${theme.purpleBold("●")} ${theme.white("P95 Latency:")} ${theme.purpleBold(latestLat)}   ${theme.muted(axisNote)}`
    );

    if (rpsSlice.length === 0 && latSlice.length === 0) {
        for (let r = 0; r < plotHeight; r++) {
            const left = r === 0 ? `${Math.round(maxRps)}`.padStart(axisLeftWidth - 1) : r === plotHeight - 1 ? "0".padStart(axisLeftWidth - 1) : " ".repeat(axisLeftWidth - 1);
            const right = r === 0 ? `${Math.round(maxLat)}`.padStart(axisRightWidth - 1) : r === plotHeight - 1 ? "0".padStart(axisRightWidth - 1) : " ".repeat(axisRightWidth - 1);
            const content =
                r === midRow
                    ? theme.muted("Waiting for live telemetry...".padStart(Math.floor((plotWidth + 29) / 2)).padEnd(plotWidth))
                    : theme.border(r === 0 || r === plotHeight - 1 ? "┈".repeat(plotWidth) : " ".repeat(plotWidth));
            lines.push(
                `${theme.muted(left)} ${theme.border("│")}${content}${theme.border("│")} ${theme.muted(right)}`
            );
        }
        lines.push(
            `${" ".repeat(axisLeftWidth)}${theme.border(`└${"─".repeat(plotWidth)}┘`)}`
        );
        return lines;
    }

    for (let r = 0; r < plotHeight; r++) {
        const ratio = 1 - r / Math.max(1, plotHeight - 1);
        const leftLabel =
            r === 0 || r === plotHeight - 1 || r === midRow
                ? `${Math.round(maxRps * ratio)}`.padStart(axisLeftWidth - 1)
                : " ".repeat(axisLeftWidth - 1);
        const rightLabel =
            r === 0 || r === plotHeight - 1 || r === midRow
                ? `${Math.round(maxLat * ratio)}`.padStart(axisRightWidth - 1)
                : " ".repeat(axisRightWidth - 1);

        let rowCells = "";
        for (let c = 0; c < plotWidth; c++) {
            const idx = r * plotWidth + c;
            const rBits = rpsCanvas[idx];
            const lBits = latCanvas[idx];
            const combined = rBits | lBits;

            if (combined === 0) {
                rowCells += r === midRow ? theme.border("·") : " ";
            } else {
                const ch = String.fromCharCode(0x2800 + combined);
                if (rBits > 0 && lBits > 0) {
                    rowCells += theme.whiteBold(ch);
                } else if (rBits > 0) {
                    rowCells += theme.cyan(ch);
                } else {
                    rowCells += theme.purple(ch);
                }
            }
        }

        lines.push(
            `${theme.muted(leftLabel)} ${theme.border("│")}${rowCells}${theme.border("│")} ${theme.muted(rightLabel)}`
        );
    }

    lines.push(
        `${" ".repeat(axisLeftWidth)}${theme.border(`└${"─".repeat(plotWidth)}┘`)}`
    );

    return lines;
}

export function renderMethodPills(activeMethod: HttpMethod): string {
    return TUI_HTTP_METHODS.map((method) => {
        if (method !== activeMethod) {
            return theme.muted(` ${method} `);
        }
        switch (method) {
            case "GET":
                return theme.emeraldPill(` ${method} `);
            case "POST":
                return theme.amberPill(` ${method} `);
            case "PUT":
                return theme.bluePill(` ${method} `);
            case "PATCH":
                return theme.purplePill(` ${method} `);
            case "DELETE":
                return theme.rosePill(` ${method} `);
            default:
                return theme.activePill(` ${method} `);
        }
    }).join(" ");
}

export interface TopBarOptions {
    breadcrumbs: readonly string[];
    statusLabel: string;
    statusTone?: "cyan" | "emerald" | "amber" | "rose";
    rightMeta?: string;
    width: number;
}

export function renderTopBar(options: TopBarOptions): string {
    const width = Math.max(40, options.width);
    const brand = theme.brandPill(" LOADFORGE ");
    const trail = options.breadcrumbs
        .map((b) => theme.whiteBold(b))
        .join(theme.border(" / "));
    const badgeFn =
        options.statusTone === "emerald"
            ? theme.emeraldPill
            : options.statusTone === "amber"
              ? theme.amberPill
              : options.statusTone === "rose"
                ? theme.rosePill
                : theme.activePill;
    const statusPill = badgeFn(` ${options.statusLabel} `);
    const meta = options.rightMeta ? `  ${theme.muted(options.rightMeta)}` : "";
    const left = ` ${brand}  ${trail}`;
    const right = `${statusPill}${meta} `;
    const gap = Math.max(2, width - visibleLength(left) - visibleLength(right));
    return theme.barSurface(padRightVisible(`${left}${" ".repeat(gap)}${right}`, width));
}

export function renderBottomBar(
    hints: ReadonlyArray<readonly [string, string]>,
    rightText: string,
    width: number
): string {
    const left = ` ${renderKeyHints(hints)}`;
    const right = rightText ? `${theme.muted(rightText)} ` : "";
    const gap = Math.max(2, width - visibleLength(left) - visibleLength(right));
    return theme.barSurface(padRightVisible(`${left}${" ".repeat(gap)}${right}`, width));
}

export function renderKeyHints(
    hints: ReadonlyArray<readonly [string, string]>
): string {
    return hints
        .map(([key, action]) => `${theme.keycap(` ${key} `)} ${theme.muted(action)}`)
        .join("  ");
}

export function renderSplitColumns(
    leftLines: readonly string[],
    rightLines: readonly string[],
    leftWidth: number,
    rightWidth: number,
    gap: number = 1
): string[] {
    const maxRows = Math.max(leftLines.length, rightLines.length);
    const spacer = " ".repeat(gap);
    const out: string[] = [];
    for (let i = 0; i < maxRows; i++) {
        const l = padRightVisible(leftLines[i] ?? "", leftWidth);
        const r = padRightVisible(rightLines[i] ?? "", rightWidth);
        out.push(`${l}${spacer}${r}`);
    }
    return out;
}

export function wrapPlainText(text: string, maxWidth: number): string[] {
    const width = Math.max(16, maxWidth);
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return [""];
    }

    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        if (current.length === 0) {
            current = word;
        } else if (current.length + 1 + word.length <= width) {
            current += ` ${word}`;
        } else {
            lines.push(current);
            current = word;
        }
    }
    if (current.length > 0) {
        lines.push(current);
    }
    return lines;
}

export function getFullScreenDimensions(size: TerminalSize): {
    width: number;
    rows: number;
    bodyRows: number;
} {
    const width = Math.max(76, size.columns - 2);
    const rows = Math.max(22, size.rows);
    const bodyRows = Math.max(14, rows - 2);
    return { width, rows, bodyRows };
}

export function composeFullScreen(
    topBar: string,
    bodyLines: readonly string[],
    bottomBar: string,
    size: TerminalSize
): string {
    const { width, bodyRows } = getFullScreenDimensions(size);
    const padLeft = size.columns > width + 1 ? " " : "";
    const content = bodyLines.slice(0, bodyRows);
    const paddedBody: string[] = [];

    for (let i = 0; i < bodyRows; i++) {
        paddedBody.push(`${padLeft}${padRightVisible(content[i] ?? "", width)}`);
    }

    return [
        `${padLeft}${padRightVisible(topBar, width)}`,
        ...paddedBody,
        `${padLeft}${padRightVisible(bottomBar, width)}`,
    ].join("\n");
}

export function composeFrame(
    lines: string[],
    size: TerminalSize,
    contentWidth: number
): string {
    const horizontalMargin = Math.max(
        0,
        Math.floor((size.columns - contentWidth) / 2)
    );
    const padLeft = " ".repeat(horizontalMargin);

    const maxRows = Math.max(10, size.rows - 1);
    const clipped = lines.slice(0, maxRows);
    const verticalMargin = Math.max(
        0,
        Math.floor((maxRows - clipped.length) / 2)
    );

    const output: string[] = Array.from({ length: verticalMargin }, () => "");
    for (const line of clipped) {
        output.push(`${padLeft}${line}`);
    }

    return output.join("\n");
}

export function centerTextLine(text: string, width: number): string {
    return padCenterVisible(text, width);
}
