import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Esports Manager: FPS',
        short_name: 'Esports Manager',
        description: 'Manage your professional esports team to glory.',
        start_url: '/',
        display: 'fullscreen',
        background_color: '#0e1217',
        theme_color: '#0e1217',
        icons: [
            {
                src: '/logo.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
