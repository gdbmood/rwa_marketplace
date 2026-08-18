function formatNumberForDisplay(value: number): string {
    const absValue = Math.abs(value);

    if (absValue < 1e3) {
        return absValue.toFixed(2);
    }

    const suffixes = [
        { threshold: 1e12, divisor: 1e12, suffix: "T" },
        { threshold: 1e9, divisor: 1e9, suffix: "B" },
        { threshold: 1e6, divisor: 1e6, suffix: "M" },
        { threshold: 1e3, divisor: 1e3, suffix: "K" },
    ];

    for (const { threshold, divisor, suffix } of suffixes) {
        if (absValue >= threshold) {
            return (absValue / divisor).toFixed(2) + suffix;
        }
    }

    // If very large number, use exponential notation
    if (absValue >= 1e15) {
        return absValue.toExponential(2);
    }

    // As fallback, format with commas
    return absValue.toLocaleString("en-US");
}

export default formatNumberForDisplay;