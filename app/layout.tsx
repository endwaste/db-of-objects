import { Analytics } from '@vercel/analytics/react';
import { Fira_Mono, Roboto } from 'next/font/google';
import { ReactNode } from 'react';
import './styles.css';

const fira_mono = Fira_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '700'],
  variable: '--font-fira_mono',
});

const roboto = Roboto({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
});

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <html lang="en">
      <head>
        <title>Universal database of objects</title>
        <link rel="icon" href="https://endwaste.io/assets/apple-touch-icon.png" type="image/png" />
        <meta name='description' content='Universal database of objects is an app built with Pinecone, Google Multimodal Embedding Model, and Next.js.' />
      </head>
      <body className={`${fira_mono.variable} ${roboto.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
