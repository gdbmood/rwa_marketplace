import { NextRequest } from 'next/server';
import FormData from 'form-data';
import * as jose from 'jose';
import crypto from 'crypto';
import axios from 'axios';

interface JwtPayload {
    ctx?: {
        walletAddress?: string;
    };
}

const SUMSUB_APP_TOKEN = process.env.SUMSUB_TOKEN!;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY!;
const SUMSUB_BASE_URL = 'https://api.sumsub.com';

var config: { baseURL?: string; method?: string; url?: string; headers?: any; data?: any } = {};
config.baseURL = SUMSUB_BASE_URL;

axios.interceptors.request.use(createSignature, function (error) {
    return Promise.reject(error);
})

function createSignature(config: any) {
    console.log('Creating a signature for the request...');

    var ts = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', SUMSUB_SECRET_KEY);
    signature.update(ts + config.method.toUpperCase() + config.url);

    if (config.data instanceof FormData) {
        signature.update(config.data.getBuffer());
    } else if (config.data) {
        signature.update(config.data);
    }

    config.headers['X-App-Access-Ts'] = ts;
    config.headers['X-App-Access-Sig'] = signature.digest('hex');

    return config;
}

function createAccessToken(externalUserId: string, levelName = 'basic-kyc-level', ttlInSecs = 600) {
    console.log("Creating an access token for initializng SDK...");

    var body = {
        userId: externalUserId,
        levelName: levelName,
        ttlInSecs: ttlInSecs
    };

    var method = 'post';
    var url = '/resources/accessTokens/sdk';

    var headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-App-Token': SUMSUB_APP_TOKEN
    };

    config.method = method;
    config.url = url;
    config.headers = headers;
    config.data = JSON.stringify(body);

    return config;
}

export async function GET(req: NextRequest) {
    const sessionCookie = req.cookies.get('jwt')
    const searchParams = req.nextUrl.searchParams
    const level = searchParams.get('level')

    if (level && ['id-only', 'id-and-liveness'].includes(level)) {
        if (sessionCookie) {
            const decodedJwt = jose.decodeJwt(sessionCookie.value) as JwtPayload;
            const externalUserId = decodedJwt.ctx?.walletAddress as string;
            if (externalUserId) {
                try {
                    const response = await axios.request(createAccessToken(externalUserId, level));
                    return Response.json(response.data.token);
                } catch (error: any) {
                    console.error('Error creating an applicant:', error.response);
                    return new Response('Error creating an applicant', { status: 500 });
                }
            }
            else {
                return new Response('External user ID not found', { status: 400 });
            }
        }
        else {
            return new Response('Unauthorized', { status: 401 });
        }
    }
    else {
        return new Response('Level not found', { status: 400 });
    }
}