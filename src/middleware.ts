import { NextRequest, NextResponse } from 'next/server'

/**
 * Business subdomain routing. On a host whose first label is exactly
 * "business" (business.example.com, business.localhost) the paths below are
 * rewritten into the /business route group. The list mirrors what actually
 * exists under src/app/business so no rewrite can land on a 404 (the legacy
 * list rewrote /marketplace, /portfolio and /verify into routes that did not
 * exist, see docs/audit/frontend.md section 3.1).
 *
 * Matching is on the first host label, not a substring, so a host that merely
 * contains "business" somewhere is not misclassified. This mirrors
 * roleFromHostname in src/hooks/useRole.ts, which cannot be imported here
 * because that module is client only.
 */

const BUSINESS_PATHS = [
    '/dashboard',
    '/list-new-asset',
    '/verify-business',
    '/profile',
    '/settings',
]

function isBusinessHost(hostHeader: string): boolean {
    // Strip the port before looking at labels (business.localhost:3000).
    const hostname = hostHeader.split(':')[0] ?? ''
    const firstLabel = hostname.split('.')[0]?.toLowerCase() ?? ''
    return firstLabel === 'business'
}

export function middleware(request: NextRequest) {
    try {
        const host = request.headers.get('host') || ''
        if (isBusinessHost(host)) {
            const url = request.nextUrl.clone()
            if (BUSINESS_PATHS.includes(url.pathname)) {
                url.pathname = `/business${url.pathname}`
                return NextResponse.rewrite(url)
            }
        }
        return NextResponse.next()
    } catch (error) {
        console.error('middleware:', error)
        return NextResponse.next()
    }
}

export const config = {
    matcher: [
        '/dashboard',
        '/list-new-asset',
        '/verify-business',
        '/profile',
        '/settings',
    ],
}
