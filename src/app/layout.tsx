import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { MobileBottomNav } from "../components/mobile-bottom-nav";
import { ScreenHelpPig } from "../components/screen-help-pig";
import { ToastProvider } from "../components/mobile-ui";
import { PwaManager } from "../components/pwa-manager";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ぽっぷ家計簿",
  description: "楽しく続ける家計簿アプリ",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${jakarta.className} bg-amber-50 text-slate-800 antialiased`}>
        {/* PCで開いた場合も、モバイル向けの表示幅を維持する。 */}
        <ToastProvider>
          <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col border-x border-slate-200">
            <main className="flex-1 pb-24">
              {children}
            </main>
            <Suspense fallback={null}>
              <MobileBottomNav />
              <ScreenHelpPig />
              <PwaManager />
            </Suspense>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
