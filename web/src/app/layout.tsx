import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TimezoneCookie } from "@/components/TimezoneCookie";
import { Analytics } from "@/components/Analytics";
import { ConsentBanner } from "@/components/ConsentBanner";

/** GA4 measurement ID; set only for production, so local and preview builds send nothing. */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim();

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "Snimok", template: "%s · Snimok" },
  description: "Instant screenshots with a shareable link.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TimezoneCookie />
        {children}
        {GA_ID ? (
          <>
            <Analytics gaId={GA_ID} />
            <ConsentBanner />
          </>
        ) : null}
      </body>
    </html>
  );
}
