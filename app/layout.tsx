import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import logo from "./img/logo.png";
import "./globals.scss";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CREDRA — Trust infrastructure for credit decisions",
  description:
    "CREDRA turns bank-linked behaviour into clear risk signals—so lenders and platforms can say yes, no, or review without guesswork.",
  icons: {
    icon: [{ url: logo.src, type: "image/png", sizes: `${logo.width}x${logo.height}` }],
    apple: [{ url: logo.src, sizes: `${logo.width}x${logo.height}` }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
