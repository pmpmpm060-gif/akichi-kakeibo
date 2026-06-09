import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ぽっぷ家計簿",
  description: "楽しくつづける家計簿アプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${jakarta.className} bg-amber-50 text-slate-800 antialiased`}>
        {/* スマホサイズに固定するコンテナ */}
        <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col border-x border-slate-200">
          <main className="flex-1 pb-24">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}