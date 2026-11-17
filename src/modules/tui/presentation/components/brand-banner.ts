import { stripAnsi } from "../theme/ansi-palette.js";

const GLYPHS: Record<string, readonly string[]> = {
    L: [
        "##...",
        "##...",
        "##...",
        "##...",
        "##...",
        "##...",
        "##...",
        "#####",
    ],
    O: [
        ".####.",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        ".####.",
    ],
    A: [
        ".####.",
        "##..##",
        "##..##",
        "######",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
    ],
    D: [
        "#####.",
        "######",
        "##..##",
        "##..##",
        "##..##",
        "##..##",
        "######",
        "#####.",
    ],
    F: [
        "#####",
        "##...",
        "##...",
        "####.",
        "##...",
        "##...",
        "##...",
        "##...",
    ],
    R: [
        "#####.",
        "##..##",
        "##..##",
        "#####.",
        "####..",
        "##.##.",
        "##..##",
        "##..##",
    ],
    G: [
        ".####.",
        "##..##",
        "##....",
        "##.###",
        "##..##",
        "##..##",
        "##..##",
        ".####.",
    ],
    E: [
        "#####",
        "##...",
        "##...",
        "####.",
        "##...",
        "##...",
        "##...",
        "#####",
    ],
    " ": [
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
    ],
};

function rgbWrap(r: number, g: number, b: number, text: string): string {
    if (process.env.NO_COLOR) {
        return text;
    }
    return `\x1b[1;38;2;${r};${g};${b}m${text}\x1b[0m`;
}

function interpolateRgb(
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    t: number
): [number, number, number] {
    return [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
    ];
}

function rasterizeWord(word: string): string[] {
    const letters = word.split("").map((ch) => GLYPHS[ch] ?? GLYPHS[" "]);
    const rows: string[] = [];

    for (let pair = 0; pair < 4; pair++) {
        const topRow = pair * 2;
        const botRow = pair * 2 + 1;
        const chunks: string[] = [];

        for (let lIdx = 0; lIdx < letters.length; lIdx++) {
            const glyph = letters[lIdx];
            const top = glyph[topRow];
            const bot = glyph[botRow];
            let cellStr = "";

            for (let x = 0; x < top.length; x++) {
                const t = top[x] === "#";
                const b = bot[x] === "#";
                cellStr += t && b ? "█" : t ? "▀" : b ? "▄" : " ";
            }
            chunks.push(cellStr);
        }

        rows.push(chunks.join(" "));
    }

    return rows;
}

/**
 * Renders the 4-row half-block pixel-font LOADFORGE wordmark in pure TypeScript,
 * aligned as a fixed-width rectangle before centering.
 */
export function renderBrandBanner(targetWidth: number): string[] {
    const loadPlain = rasterizeWord("LOAD");
    const forgePlain = rasterizeWord("FORGE");

    const combinedPlainWidth =
        loadPlain[0].length + 2 + forgePlain[0].length;

    if (targetWidth < combinedPlainWidth) {
        const fallback = "LOADFORGE";
        const pad = Math.max(0, Math.floor((targetWidth - fallback.length) / 2));
        return [`${" ".repeat(pad)}${rgbWrap(56, 189, 248, fallback)}`];
    }

    const leftMargin = Math.max(
        0,
        Math.floor((targetWidth - combinedPlainWidth) / 2)
    );
    const padStr = " ".repeat(leftMargin);

    const loadStart: [number, number, number] = [56, 189, 248];
    const loadEnd: [number, number, number] = [16, 185, 129];
    const forgeStart: [number, number, number] = [251, 191, 36];
    const forgeEnd: [number, number, number] = [249, 115, 22];

    const lines: string[] = [];
    for (let r = 0; r < 4; r++) {
        const t = r / 3;
        const [lr, lg, lb] = interpolateRgb(loadStart, loadEnd, t);
        const [fr, fg, fb] = interpolateRgb(forgeStart, forgeEnd, t);
        const coloredLoad = rgbWrap(lr, lg, lb, loadPlain[r]);
        const coloredForge = rgbWrap(fr, fg, fb, forgePlain[r]);
        const rightPad = Math.max(
            0,
            targetWidth - leftMargin - stripAnsi(loadPlain[r]).length - 2 - stripAnsi(forgePlain[r]).length
        );
        lines.push(`${padStr}${coloredLoad}  ${coloredForge}${" ".repeat(rightPad)}`);
    }

    return lines;
}
