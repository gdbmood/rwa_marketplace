import { NextRequest, NextResponse } from 'next/server'

const PATHS = ['/marketplace', '/portfolio', '/verify', '/verify-business', '/list-new-asset', '/dashboard']

function rewriteToBusiness(url: URL) {
    url.pathname = `/business${url.pathname === '/' ? '' : url.pathname}`
    return NextResponse.rewrite(url)
}

export async function middleware(request: NextRequest) {
    try {
        const hostname = request.headers.get('host') || ''
        const url = request.nextUrl.clone()
        if (hostname.includes('business')) {
            if (PATHS.includes(url.pathname)) {
                return rewriteToBusiness(url)
            }
        }
        return NextResponse.next()
    } catch (error) {
        console.error(error)
        return NextResponse.redirect(new URL('/', request.url))
    }
}