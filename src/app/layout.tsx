import type { Metadata } from 'next';
import './globals.css';
import ResetHandler from './reset-handler';

export const metadata: Metadata = {
  title: 'SDDA TrialDesk',
  description: 'Local-first secretary software for SDDA scent detection trials',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ResetHandler />
        {children}
      </body>
    </html>
  );
}
