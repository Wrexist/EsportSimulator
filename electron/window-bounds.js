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

// Saved window bounds restored on another screen (CROSSCUT-07, 2026-11-15): a
// window saved at 2560x1440 and opened on a 1920x1080 laptop must not hang off
// the work area. The size is clamped like a chosen resolution, then the
// position is moved so the whole window lies inside the work area.
function fitBoundsToWorkArea(bounds, workArea, limits) {
    const { width, height } = clampWindowSize(bounds && bounds.width, bounds && bounds.height, workArea, limits);
    const fitted = { width, height };
    const x = Number(bounds && bounds.x);
    const y = Number(bounds && bounds.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return fitted;
    const ax = Math.floor(Number(workArea && workArea.x));
    const ay = Math.floor(Number(workArea && workArea.y));
    const aw = Math.floor(Number(workArea && workArea.width));
    const ah = Math.floor(Number(workArea && workArea.height));
    if (![ax, ay, aw, ah].every(Number.isFinite) || aw <= 0 || ah <= 0) return { ...fitted, x: Math.floor(x), y: Math.floor(y) };
    fitted.x = Math.max(ax, Math.min(Math.floor(x), ax + aw - width));
    fitted.y = Math.max(ay, Math.min(Math.floor(y), ay + ah - height));
    return fitted;
}

// The window's minimum size (CROSSCUT-05, 2026-11-17): the UI minimum, but
// never more than the size the window opened at. That size is already clamped
// to the work area, so on a screen smaller than the minimum (a 1366x768 laptop
// at 125% scaling) BrowserWindow does not grow the window under the taskbar.
function windowMinimumSize(bounds, limits) {
    const width = Math.floor(Number(bounds && bounds.width));
    const height = Math.floor(Number(bounds && bounds.height));
    return {
        minWidth: Number.isFinite(width) && width > 0 ? Math.min(limits.minWidth, width) : limits.minWidth,
        minHeight: Number.isFinite(height) && height > 0 ? Math.min(limits.minHeight, height) : limits.minHeight,
    };
}

module.exports = { clampWindowSize, fitBoundsToWorkArea, windowMinimumSize };
