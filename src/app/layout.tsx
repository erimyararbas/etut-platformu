import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Prototipin yazı tipi. latin-ext alt kümesi Türkçe karakterler için gerekli.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Etüt Platformu",
  description: "Okullar için etüt rezervasyon ve akademik takip sistemi",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
