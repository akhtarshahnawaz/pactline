import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const title = "Pactline — Negotiation OS for supply chains";
  const description = "Turn contracts, correspondence, and shipment evidence into a defensible negotiation strategy.";

  return {
    metadataBase: baseUrl,
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      images: [{ url: new URL("/og.png", baseUrl).toString(), width: 1730, height: 909, alt: "Pactline negotiation OS for supply chains" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og.png", baseUrl).toString()] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}>{children}</body></html>;
}
