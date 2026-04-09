import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import UserMenu from '@/components/UserMenu';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Worker Platform - 边缘计算控制台',
  description: '全托管 Serverless 平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <div className="layout-wrapper">
          <nav className="glass-panel main-nav">
            <div className="nav-container">
              <div className="logo">
                <div className="logo-icon"></div>
                <span>Serverless 平台</span>
              </div>
              <div className="nav-links">
                <Link href="/" className="active">总览</Link>
                <a href="#">监控日志</a>
                <a href="#">账户中心</a>
              </div>
              <div className="user-profile">
                <UserMenu />
              </div>
            </div>
          </nav>
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
