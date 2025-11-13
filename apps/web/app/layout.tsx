import type { Metadata } from 'next';
import './globals.scss';

export const metadata: Metadata = {
  title: 'Hapoel Tel Aviv AI',
  description: 'Ask anything about Hapoel Tel Aviv basketball or football and get instant answers.',
  icons: {
    icon: '/hapoel.ico',
  },
};

// Root layout should only return children - the locale layout will provide html/body
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

