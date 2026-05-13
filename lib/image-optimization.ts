/**
 * Image Optimization Utilities
 * Helpers for optimizing images and lazy loading
 */

/**
 * Optimize image URL with Next.js Image Optimization
 */
export function getOptimizedImageUrl(
    src: string,
    width: number,
    quality = 75
): string {
    if (!src) return ''

    // If using Next.js Image component, it handles optimization
    // This is for manual optimization
    const params = new URLSearchParams({
        url: src,
        w: width.toString(),
        q: quality.toString()
    })

    return `/_next/image?${params.toString()}`
}

/**
 * Lazy load images on scroll
 */
export function useLazyImage(threshold = 0.1) {
    if (typeof window === 'undefined') return null

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target as HTMLImageElement
                    const dataSrc = img.getAttribute('data-src')

                    if (dataSrc) {
                        img.src = dataSrc
                        img.removeAttribute('data-src')
                        observer.unobserve(img)
                    }
                }
            })
        },
        { threshold }
    )

    return observer
}

/**
 * Preload critical images
 */
export function preloadImages(urls: string[]) {
    if (typeof window === 'undefined') return

    urls.forEach(url => {
        const link = document.createElement('link')
        link.rel = 'preload'
        link.as = 'image'
        link.href = url
        document.head.appendChild(link)
    })
}

/**
 * Convert image to WebP if supported
 */
export function supportsWebP(): boolean {
    if (typeof window === 'undefined') return false

    const canvas = document.createElement('canvas')
    if (canvas.getContext && canvas.getContext('2d')) {
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
    }

    return false
}

/**
 * Get responsive image sizes
 */
export function getResponsiveSizes(baseWidth: number) {
    return {
        mobile: Math.floor(baseWidth * 0.5),
        tablet: Math.floor(baseWidth * 0.75),
        desktop: baseWidth,
        large: Math.floor(baseWidth * 1.5)
    }
}

/**
 * Image placeholder for loading
 */
export function getImagePlaceholder(width: number, height: number): string {
    // Generate a tiny blurred placeholder
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'%3E%3Crect fill='%23333' width='${width}' height='${height}'/%3E%3C/svg%3E`
}

/**
 * Compress image quality based on network speed
 */
export function getAdaptiveQuality(): number {
    if (typeof navigator === 'undefined') return 75

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

    if (!connection) return 75

    const effectiveType = connection.effectiveType

    switch (effectiveType) {
        case '4g':
            return 85
        case '3g':
            return 65
        case '2g':
            return 50
        case 'slow-2g':
            return 40
        default:
            return 75
    }
}
