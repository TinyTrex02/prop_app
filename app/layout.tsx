import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prop Hedge Optimizer",
  description: "Model prop-firm evaluations, personal-account hedges and payout scenarios."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
