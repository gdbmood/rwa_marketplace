import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { AuthError, requireUser } from '@/lib/auth/session';
import { createServiceClient } from '@/lib/supabase/server';
import type { ActionErrorCode, ActionResult } from '@/actions/result';

/**
 * POST /business/uploads
 *
 * Business-only media upload for asset listings (images, ownership documents,
 * company logo). Multipart form data: `file` plus `kind` (image | document |
 * logo). Files land in the public asset-images / asset-documents buckets
 * under the caller's user id; the response returns the public URL. A route
 * handler (not a server action) so uploads are not capped by the server
 * action body size limit.
 */

export interface UploadedAssetFile {
    url: string;
    path: string;
    name: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const DOCUMENT_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

type UploadKind = 'image' | 'document' | 'logo';

function json(result: ActionResult<UploadedAssetFile>, status: number): Response {
    return Response.json(result, { status });
}

function failure(code: ActionErrorCode, message: string, status: number): Response {
    return json({ ok: false, error: { code, message } }, status);
}

function sanitizeFileName(name: string): string {
    const trimmed = name.slice(-120);
    const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
    return safe.length > 0 ? safe : 'file';
}

export async function POST(req: NextRequest) {
    let user;
    try {
        ({ user } = await requireUser());
    } catch (error) {
        if (error instanceof AuthError) {
            return failure('unauthenticated', 'You must be logged in to upload files', 401);
        }
        console.error('[business/uploads] session check failed');
        return failure('internal', 'Something went wrong, please try again', 500);
    }
    if (user.type !== 'business') {
        return failure('forbidden', 'Only business accounts can upload asset files', 403);
    }

    let form: FormData;
    try {
        form = await req.formData();
    } catch {
        return failure('invalid_input', 'Expected multipart form data', 400);
    }

    const kindValue = form.get('kind');
    const kind: UploadKind | null =
        kindValue === 'image' || kindValue === 'document' || kindValue === 'logo' ? kindValue : null;
    if (!kind) {
        return failure('invalid_input', 'kind must be image, document or logo', 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
        return failure('invalid_input', 'file is required', 400);
    }
    if (!file.size || file.size > MAX_FILE_SIZE) {
        return failure('invalid_input', 'File size should be less than 5MB', 400);
    }

    const allowedTypes = kind === 'document' ? DOCUMENT_TYPES : IMAGE_TYPES;
    if (!allowedTypes.has(file.type)) {
        return failure(
            'invalid_input',
            kind === 'document' ? 'Documents must be pdf, doc or docx' : 'Images must be png or jpeg',
            400,
        );
    }

    const bucket = kind === 'document' ? 'asset-documents' : 'asset-images';
    const prefix = kind === 'logo' ? 'logos' : 'assets';
    const path = `${prefix}/${user.id}/${randomUUID()}/${sanitizeFileName(file.name)}`;

    try {
        const db = createServiceClient();
        const buffer = Buffer.from(await file.arrayBuffer());
        const upload = await db.storage.from(bucket).upload(path, buffer, {
            contentType: file.type,
            upsert: false,
        });
        if (upload.error) {
            console.error(`[business/uploads] storage upload failed: ${upload.error.message}`);
            return failure('internal', 'Upload failed, please try again', 500);
        }
        const { data } = db.storage.from(bucket).getPublicUrl(path);
        return json({ ok: true, data: { url: data.publicUrl, path, name: file.name } }, 200);
    } catch (error) {
        console.error('[business/uploads]', error instanceof Error ? error.message : error);
        return failure('internal', 'Upload failed, please try again', 500);
    }
}
