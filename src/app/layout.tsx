import type { Metadata } from "next";
import { Anton, Noto_Sans_KR, Space_Grotesk, Space_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"] });
const notoKr = Noto_Sans_KR({ variable: "--font-noto-kr", weight: ["400", "700"], preload: false });

export const metadata: Metadata = {
  title: "PromHub",
  description: "Version control for your prompts",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${anton.variable} ${spaceGrotesk.variable} ${spaceMono.variable} ${notoKr.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        {children}
      </body>
    </html>
  );
}
