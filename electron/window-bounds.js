// Window size for a chosen resolution (CROSSCUT-06): at least the minimum the
// UI needs, and never larger than the work area of the display the window is
// on, so a 1920x1080 choice on a 1366x768 screen cannot push the title bar
// offscreen. When the work area itself is below the minimum, the work area wins.
function clampWindowSize(width, height, workArea, limits) {
    const { minWidth, minHeight, defaultWidth, defaultHeight } = limits;
    const wantW = Number.isFinite(Number(width)) && Number(width) > 0 ? Math.floor(Number(width)) : defaultWidth;
    const wantH = Number.isFinite(Number(height)) && Number(height) > 0 ? Math.floor(Number(height)) : defaultHeight;
    let w = Math.max(minWidth, wantW);
    let h = Math.max(minHeight, wantH);
    const areaW = Math.floor(Number(workArea && workArea.width));
    const areaH = Math.floor(Number(workArea && workArea.height));
    if (Number.isFinite(areaW) && areaW > 0) w = Math.min(w, areaW);
    if (Number.isFinite(areaH) && areaH > 0) h = Math.min(h, areaH);
    return { width: w, height: h };
}

module.exports = { clampWindowSize };
