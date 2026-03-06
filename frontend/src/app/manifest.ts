import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Cloud Shakes',
        short_name: 'Shakes',
        description: 'Almacenamiento en la nube privado, seguro y de alto rendimiento',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2383e2',
        orientation: 'any',
        categories: ['productivity', 'utilities'],
        icons: [
            {
                src: '/logo-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
            },
            {
                src: '/logo-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
        ],
        shortcuts: [
            {
                name: 'Archivos',
                short_name: 'Archivos',
                url: '/dashboard',
                icons: [{ src: '/logo-192.png', sizes: '192x192' }],
            },
            {
                name: 'Documentos',
                short_name: 'Docs',
                url: '/dashboard/documents',
                icons: [{ src: '/logo-192.png', sizes: '192x192' }],
            },
            {
                name: 'Notas',
                short_name: 'Notas',
                url: '/dashboard/notes',
                icons: [{ src: '/logo-192.png', sizes: '192x192' }],
            },
            {
                name: 'Calendario',
                short_name: 'Cal',
                url: '/dashboard/calendar',
                icons: [{ src: '/logo-192.png', sizes: '192x192' }],
            },
        ],
    };
}
