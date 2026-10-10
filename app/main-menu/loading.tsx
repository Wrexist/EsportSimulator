// Plain ink while the menu chunk loads: no placeholder title to flash.
export default function Loading() {
    return <div className="min-h-dvh bg-ink" aria-busy="true" />
}
