import 'server-only';

import type { Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';
import { type Row, unwrap } from '@/lib/db/helpers';

export type AuditLogRow = Row<'audit_log'>;

export interface WriteAuditInput {
  /** Null for system-initiated actions (indexer, webhooks). */
  actorUserId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  diff?: Json | null;
}

export async function writeAudit(input: WriteAuditInput): Promise<AuditLogRow> {
  const db = createServiceClient();
  const result = await db
    .from('audit_log')
    .insert({
      actor_user_id: input.actorUserId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entityId ?? null,
      diff: input.diff ?? null,
    })
    .select('*')
    .single();
  return unwrap(result, 'audit.writeAudit');
}
