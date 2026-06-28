import type { Config } from "tailwindcss"
import { tokens } from "./src/design/tokens"

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ...tokens.colors,
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        ...tokens.borderRadius,
        // shadcn compatibility — preserve CSS-var-driven radii under distinct keys
        "shadcn-lg": "var(--radius)",
        "shadcn-md": "calc(var(--radius) - 2px)",
        "shadcn-sm": "calc(var(--radius) - 4px)",
      },
      spacing: tokens.spacing,
      fontSize: tokens.fontSize,
      fontWeight: tokens.fontWeight,
      fontFamily: tokens.fontFamily,
      boxShadow: tokens.boxShadow,
      transitionTimingFunction: {
        // Smooth "glass" easing (easeOutExpo-like) used by liquid-panel surfaces.
        glass: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      zIndex: {
        dropdown: "50",
        "modal-backdrop": "100",
        modal: "110",
        celebration: "200",
        sheet: "300",
        dialog: "400",
        devtools: "900",
        toast: "950",
        overlay: "1000",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
