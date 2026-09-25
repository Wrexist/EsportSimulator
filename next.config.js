// Only require @next/bundle-analyzer when ANALYZE=true is set, so production
// installs (`npm ci --omit=dev`) that never enable analysis don't blow up at
// config load time on a missing devDependency. When ANALYZE is off we fall
// back to an identity wrapper and the package isn't touched.
const withBundleAnalyzer = process.env.ANALYZE === 'true'
    ? require('@next/bundle-analyzer')({ enabled: true, openAnalyzer: false })
    : (config) => config

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Dev compiler workers reload this file independently of a custom server's
    // `conf` option. Keep review builds isolated in those workers as well.
    distDir: process.env.ESIM_ISOLATED_REVIEW === '1' ? 'tmp/anubis-radar-dev-build' : '.next',
    env: {
        NEXT_PUBLIC_GAME_VERSION: (() => { try { return require('./package.json').version; } catch { return '1.0.0'; } })(),
    },
    reactStrictMode: true,
    eslint: {
        ignoreDuringBuilds: false,
    },
    images: {
        unoptimized: true,
    },
    typescript: {
        ignoreBuildErrors: false,
    },
    productionBrowserSourceMaps: false,
    // Tree-shake lucide-react. Without this, importing { Foo } from 'lucide-react'
    // pulls the full barrel into the client bundle (~150 KB+ depending on icon
    // set). modularizeImports rewrites each named import to its own deep path
    // at compile time so only the icons we actually use ship.
    modularizeImports: {
        'lucide-react': {
            transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
            preventFullImport: true,
        },
    },
    // Disable worker threads for build (fixes spawn UNKNOWN error)
    experimental: {
        workerThreads: false,
        cpus: 1,
    },
    // Force webpack for builds (Turbopack has export issues)
    webpack: (config, { webpack }) => {
        // Reduce memory usage
        config.optimization = {
            ...config.optimization,
            moduleIds: 'deterministic',
            minimizer: config.optimization.minimizer?.map(plugin => {
                if (plugin.constructor.name === 'TerserPlugin') {
                    plugin.options.minimizer.options.compress = {
                        ...plugin.options.minimizer.options.compress,
                        drop_console: ['log', 'debug', 'info'],
                    }
                }
                return plugin
            }),
        }
        return config
    },
}

module.exports = withBundleAnalyzer(nextConfig)
