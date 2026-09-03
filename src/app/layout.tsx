import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { Roboto } from "next/font/google";
import AppProviders from '@/components/providers';
import '../../public/css/satoshi.css';
import type { Metadata } from "next";
import theme from '@/theme';
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "RWA Marketplace",
  description: "Real World Assets Marketplace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/img/logo_dark.png" />
      </head>
      <body
        className={`${roboto.className} antialiased`}
      >
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme} defaultMode="dark">
            <CssBaseline />
            <AppProviders>
              <InitColorSchemeScript attribute="class" />
              {children}
            </AppProviders>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
