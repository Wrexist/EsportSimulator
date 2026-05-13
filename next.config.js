// Only require @next/bundle-analyzer when ANALYZE=true is set, so production
// installs (`npm ci --omit=dev`) that never enable analysis don't blow up at
// config load time on a missing devDependency. When ANALYZE is off we fall
// back to an identity wrapper and the package isn't touched.
const withBundleAnalyzer = process.env.ANALYZE === 'true'
    ? require('@next/bundle-analyzer')({ enabled: true, openAnalyzer: false })
    : (config) => config

/** @type {import('next').NextConfig} */
const nextConfig = {
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
