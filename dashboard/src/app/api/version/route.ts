import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || "0",
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}
