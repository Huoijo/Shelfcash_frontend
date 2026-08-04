import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShelfCash",
  description:
    "Dự báo nhu cầu, theo dõi tồn kho và lập kế hoạch nhập hàng cho cửa hàng.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
