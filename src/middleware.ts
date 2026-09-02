// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
    // 1. THE DEAD SWITCH: If we are on Netlify (not VPS), block ALL sub-routes instantly
    if (process.env.IS_VPS !== "true") {
        return NextResponse.json({
            error: 'Not Found'
        },
            { status: 404 });
    }

    // 2. THE GLOBAL AUTH GUARD: Verify the secure token for every single sub-route
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.VPS_AUTH_TOKEN}`) {
        return new NextResponse(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'content-type': 'application/json' } }
        );
    }

    // If we are on the VPS and the token matches, let the request pass through smoothly
    return NextResponse.next();
}

// 3. THE MATCHER: Tell Next.js to run this middleware ONLY on your VPS sub-routes
export const config = {
    matcher: '/api/vps/:path*',
};
