/**
 * Browser helper for the business upload route. Throws an Error with a user
 * readable message on failure so callers can surface it directly.
 */

export interface UploadedBusinessFile {
    url: string;
    path: string;
    name: string;
}

type UploadResponse =
    | { ok: true; data: UploadedBusinessFile }
    | { ok: false; error: { code: string; message: string } };

export async function uploadBusinessFile(
    file: File,
    kind: 'image' | 'document' | 'logo',
): Promise<UploadedBusinessFile> {
    const formData = new FormData();
    formData.set('kind', kind);
    formData.set('file', file);

    let response: Response;
    try {
        response = await fetch('/business/uploads', { method: 'POST', body: formData });
    } catch {
        throw new Error(`Could not upload ${file.name}, check your connection and try again`);
    }

    let body: UploadResponse;
    try {
        body = (await response.json()) as UploadResponse;
    } catch {
        throw new Error(`Could not upload ${file.name}, please try again`);
    }

    if (!body.ok) {
        throw new Error(body.error.message);
    }
    return body.data;
}

/** Uploads every pending File in a mixed list, preserving order. */
export async function resolveUploads(
    items: (File | string)[],
    kind: 'image' | 'document',
): Promise<string[]> {
    const urls: string[] = [];
    for (const item of items) {
        if (typeof item === 'string') {
            urls.push(item);
        } else {
            const uploaded = await uploadBusinessFile(item, kind);
            urls.push(uploaded.url);
        }
    }
    return urls;
}

/** Uploads pending document Files per field, preserving order. */
export async function resolveDocumentUploads(documents: {
    [key: string]: (File | string)[];
}): Promise<Record<string, string[]>> {
    const resolved: Record<string, string[]> = {};
    for (const key of Object.keys(documents)) {
        resolved[key] = await resolveUploads(documents[key], 'document');
    }
    return resolved;
}
