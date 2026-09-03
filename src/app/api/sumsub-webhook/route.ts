import { NextRequest } from 'next/server';
import type { Json } from '@/types/database';
import { getUserByWallet, setUserVerified } from '@/lib/db/users';
import { verifyWebhookDigest } from '@/lib/sumsub/client';
import { type KycStatus, upsertKycByExternalId } from '@/lib/db/kyc';

interface SumsubWebhookPayload {
  type?: string;
  externalUserId?: string;
  applicantId?: string;
  levelName?: string;
  reviewResult?: {
    reviewAnswer?: string;
  };
}

function mapKycStatus(payload: SumsubWebhookPayload): KycStatus {
  if (payload.type === 'applicantReset') {
    return 'reset';
  }
  const answer = payload.reviewResult?.reviewAnswer;
  if (answer === 'GREEN') {
    return 'approved';
  }
  if (answer === 'RED') {
    return 'rejected';
  }
  return 'pending';
}

/**
 * POST /api/sumsub-webhook
 *
 * Every delivery is authenticated by recomputing the x-payload-digest HMAC
 * over the raw body with SUMSUB_WEBHOOK_SECRET (constant-time compare) before
 * anything is parsed or written. Upserts kyc_identities by the Sumsub
 * applicant id, stores the raw payload, flips users.is_verified on approval
 * and revokes it on rejection or reset. Responds 200 fast; processing
 * failures return 500 so Sumsub retries.
 */
export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return Response.json({ status: 'error', message: 'Unreadable body' }, { status: 400 });
  }

  const digest = req.headers.get('x-payload-digest');
  const algorithm = req.headers.get('x-payload-digest-alg');
  if (!verifyWebhookDigest(rawBody, digest, algorithm)) {
    return Response.json({ status: 'error', message: 'Invalid signature' }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 });
  }
  const payload = parsed as SumsubWebhookPayload;

  try {
    const externalUserId =
      typeof payload.externalUserId === 'string' ? payload.externalUserId : null;
    if (!externalUserId) {
      // Not an applicant-scoped webhook (e.g. a test ping); acknowledge it.
      return Response.json({ status: 'ok' });
    }

    // The external user id is the wallet address we opened the session with.
    const user = await getUserByWallet(externalUserId);
    if (!user) {
      console.error('[sumsub-webhook] no user for external id, acknowledging');
      return Response.json({ status: 'ok' });
    }

    const status = mapKycStatus(payload);
    const reviewed = status === 'approved' || status === 'rejected';
    await upsertKycByExternalId({
      userId: user.id,
      externalId: typeof payload.applicantId === 'string' ? payload.applicantId : null,
      status,
      rawPayload: parsed as Json,
      reviewedAt: reviewed ? new Date().toISOString() : null,
    });

    if (status === 'approved') {
      await setUserVerified(user.id, true);
    } else if (status === 'rejected' || status === 'reset') {
      await setUserVerified(user.id, false);
    }

    return Response.json({ status: 'ok' });
  } catch (error) {
    // No payload contents in logs: Sumsub webhooks carry applicant PII.
    console.error(
      '[sumsub-webhook] processing failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    return Response.json(
      { status: 'error', message: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
