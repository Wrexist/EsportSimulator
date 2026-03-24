/**
 * SVG filter definitions for colorblind simulation modes.
 * Referenced by CSS classes in globals.css:
 *   html.colorblind-deuteranopia { filter: url('#deuteranopia-filter') }
 *   html.colorblind-protanopia { filter: url('#protanopia-filter') }
 *   html.colorblind-tritanopia { filter: url('#tritanopia-filter') }
 *
 * Render this component once in the root layout.
 * The SVG is hidden (0x0) and only provides filter definitions.
 */
export function ColorblindFilters() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="absolute w-0 h-0 overflow-hidden"
      aria-hidden="true"
    >
      <defs>
        {/* Deuteranopia (red-green, most common ~6% of males) */}
        <filter id="deuteranopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.625 0.375 0     0 0
                    0.7   0.3   0     0 0
                    0     0.3   0.7   0 0
                    0     0     0     1 0"
          />
        </filter>

        {/* Protanopia (red-blind ~1% of males) */}
        <filter id="protanopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.567 0.433 0     0 0
                    0.558 0.442 0     0 0
                    0     0.242 0.758 0 0
                    0     0     0     1 0"
          />
        </filter>

        {/* Tritanopia (blue-yellow, rare ~0.01%) */}
        <filter id="tritanopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.95  0.05  0     0 0
                    0     0.433 0.567 0 0
                    0     0.475 0.525 0 0
                    0     0     0     1 0"
          />
        </filter>
      </defs>
    </svg>
  )
}
