const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

function colorsEnabled(): boolean {
    return !process.env.NO_COLOR;
}

function wrap(code: string, text: string): string {
    if (!colorsEnabled()) {
        return text;
    }
    return `\x1b[${code}m${text}\x1b[0m`;
}

function wrapPreserveBg(baseCode: string, text: string): string {
    if (!colorsEnabled()) {
        return text;
    }
    const restored = text.replace(/\x1b\[0m/g, `\x1b[0;${baseCode}m`);
    return `\x1b[${baseCode}m${restored}\x1b[0m`;
}

export const theme = {
    cyan: (s: string) => wrap("38;2;56;189;248", s),
    cyanBold: (s: string) => wrap("1;38;2;56;189;248", s),
    emerald: (s: string) => wrap("38;2;52;211;153", s),
    emeraldBold: (s: string) => wrap("1;38;2;52;211;153", s),
    emeraldPill: (s: string) => wrapPreserveBg("1;38;2;6;78;59;48;2;52;211;153", s),
    tealPill: (s: string) => wrapPreserveBg("1;38;2;240;253;250;48;2;15;118;110", s),
    amberPill: (s: string) => wrapPreserveBg("1;38;2;69;26;3;48;2;251;191;36", s),
    purplePill: (s: string) => wrapPreserveBg("1;38;2;245;243;255;48;2;109;40;217", s),
    rosePill: (s: string) => wrapPreserveBg("1;38;2;255;241;242;48;2;190;18;60", s),
    activePill: (s: string) => wrapPreserveBg("1;38;2;240;249;255;48;2;14;116;144", s),
    brandPill: (s: string) => wrapPreserveBg("1;38;2;8;47;73;48;2;56;189;248", s),
    bluePill: (s: string) => wrapPreserveBg("1;38;2;240;249;255;48;2;30;64;175", s),
    barSurface: (s: string) => wrapPreserveBg("48;2;15;23;42;38;2;226;232;240", s),
    zebraRow: (s: string) => wrapPreserveBg("48;2;19;27;41;38;2;226;232;240", s),
    blue: (s: string) => wrap("38;2;96;165;250", s),
    purple: (s: string) => wrap("38;2;167;139;250", s),
    purpleBold: (s: string) => wrap("1;38;2;196;181;253", s),
    rose: (s: string) => wrap("38;2;251;113;133", s),
    roseBold: (s: string) => wrap("1;38;2;253;164;175", s),
    amber: (s: string) => wrap("38;2;251;191;36", s),
    amberBold: (s: string) => wrap("1;38;2;252;211;77", s),
    border: (s: string) => wrap("38;2;63;75;94", s),
    borderActive: (s: string) => wrap("38;2;56;189;248", s),
    borderCyan: (s: string) => wrap("38;2;56;189;248", s),
    borderEmerald: (s: string) => wrap("38;2;52;211;153", s),
    borderPurple: (s: string) => wrap("38;2;167;139;250", s),
    borderAmber: (s: string) => wrap("38;2;251;191;36", s),
    borderRose: (s: string) => wrap("38;2;251;113;133", s),
    muted: (s: string) => wrap("38;2;148;163;184", s),
    white: (s: string) => wrap("38;2;226;232;240", s),
    whiteBold: (s: string) => wrap("1;38;2;248;250;252", s),
    dim: (s: string) => wrap("2", s),
    keycap: (s: string) => wrapPreserveBg("1;38;2;226;232;240;48;2;39;48;63", s),
    focusRow: (s: string) => wrapPreserveBg("48;2;30;41;59;38;2;248;250;252", s),
};

export function stripAnsi(value: string): string {
    return value.replace(ANSI_ESCAPE_REGEX, "");
}

export function visibleLength(value: string): number {
    return stripAnsi(value).length;
}

export function truncateVisible(value: string, maxWidth: number): string {
    if (maxWidth <= 0) {
        return "";
    }

    if (visibleLength(value) <= maxWidth) {
        return value;
    }

    let visible = 0;
    let out = "";
    let index = 0;

    while (index < value.length && visible < maxWidth - 1) {
        if (value[index] === "\x1b" && value[index + 1] === "[") {
            const mIndex = value.indexOf("m", index);
            if (mIndex !== -1) {
                out += value.slice(index, mIndex + 1);
                index = mIndex + 1;
                continue;
            }
        }

        out += value[index];
        visible += 1;
        index += 1;
    }

    return `${out}…\x1b[0m`;
}

export function padRightVisible(value: string, width: number): string {
    const truncated = truncateVisible(value, width);
    const pad = Math.max(0, width - visibleLength(truncated));
    return `${truncated}${" ".repeat(pad)}`;
}

export function padCenterVisible(value: string, width: number): string {
    const truncated = truncateVisible(value, width);
    const len = visibleLength(truncated);
    if (len >= width) {
        return truncated;
    }
    const left = Math.floor((width - len) / 2);
    const right = width - len - left;
    return `${" ".repeat(left)}${truncated}${" ".repeat(right)}`;
}
