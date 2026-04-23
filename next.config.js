const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
    openAnalyzer: false,
})

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
