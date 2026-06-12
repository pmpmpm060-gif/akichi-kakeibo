import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ぽっぷ家計簿',
    short_name: 'ぽっぷ家計簿',
    description: '夫婦で楽しく続ける家計簿アプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#fffbeb',
    theme_color: '#6ee7b7',
    icons: [{ src: '/window.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
