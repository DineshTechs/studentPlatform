import { newId } from './ids.js';

// Append-only log of administrative and content-workflow actions.
export async function audit(ctx, action, entity, entityId, data = {}) {
  try {
    await ctx.db.collection('audit_log').insertOne({
      _id: newId('aud'),
      at: ctx.now,
      actorId: ctx.user?._id ?? null,
      actorRole: ctx.user?.role ?? null,
      action,
      entity,
      entityId,
      data,
      ip: ctx.ip,
    });
  } catch (err) {
    // Auditing must never take down the request; surface it in server logs instead.
    console.error('[audit] failed to record', action, err.message);
  }
}
