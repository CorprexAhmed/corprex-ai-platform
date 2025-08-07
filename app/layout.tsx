import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: "Corprex AI - Advanced Intelligence Platform",
  description: "Enterprise AI solutions powered by Corprex",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
  appearance={{
    baseTheme: undefined,
    variables: {
      colorPrimary: '#ffffff',
      colorBackground: '#0a0a0a',
      colorInputBackground: '#1a1a1a',
      colorInputText: '#ffffff',
      colorText: '#ffffff',
      colorTextSecondary: '#cccccc',
    },
    elements: {
      formButtonPrimary: {
        backgroundColor: '#ffffff',
        color: '#000000',
        '&:hover': {
          backgroundColor: '#cccccc',
        },
      },
      card: {
        backgroundColor: '#0a0a0a',
        border: '1px solid #333333',
        color: '#ffffff',
      },
      userButtonPopoverCard: {
        backgroundColor: '#0a0a0a',
        border: '1px solid #333333',
      },
      userButtonPopoverActionButton: {
        color: '#ffffff',
        '&:hover': {
          backgroundColor: '#1a1a1a',
        },
      },
      userButtonPopoverActionButtonText: {
        color: '#ffffff',
      },
      userPreviewMainIdentifier: {
        color: '#ffffff',
      },
      userPreviewSecondaryIdentifier: {
        color: '#cccccc',
      },
      profileSectionTitle: {
        color: '#ffffff',
      },
      profileSectionContent: {
        color: '#cccccc',
      },
      accordionTriggerButton: {
        color: '#ffffff',
      },
      navbarButton: {
        color: '#ffffff',
      },
      headerTitle: {
        color: '#ffffff',
      },
      headerSubtitle: {
        color: '#cccccc',
      },
    },
  }}
>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}