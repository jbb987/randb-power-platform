import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/** Maintain `users/{uid}/my-work/{itemId}` mirrors on every `work-items`
 *  write. The mirror is a slim per-user assignment index: one subcollection
 *  query per user replaces a fan-out across source tools, which is what
 *  makes the My Stuff view load instantly.
 *
 *  Behavior:
 *  - On create / assignee added: write mirror to each new assignee.
 *  - On any other update: refresh mirror for every current assignee.
 *  - On assignee removed: delete mirror from the removed users.
 *  - On soft delete (deletedAt flipped non-null) or hard delete: clear all
 *    mirrors from the previous assignee set.
 *
 *  Region: us-central1 default (matches the database location). */
export const onWorkItemWrite = onDocumentWritten('work-items/{itemId}', async (event) => {
  const itemId = event.params.itemId;
  const change = event.data;
  if (!change) return;

  const before = change.before.exists ? change.before.data() : undefined;
  const after = change.after.exists ? change.after.data() : undefined;

  const beforeAssignees = new Set<string>((before?.assigneeIds as string[] | undefined) ?? []);
  const afterAssignees = new Set<string>((after?.assigneeIds as string[] | undefined) ?? []);

  const wasActive = !!before && (before.deletedAt ?? null) === null;
  const isActive = !!after && (after.deletedAt ?? null) === null;

  const firestore = admin.firestore();
  const batch = firestore.batch();

  if (!isActive) {
    // Hard-deleted, soft-deleted, or never-existed-and-now-gone. Clear every
    // mirror from the previous assignee set (and from current, defensively).
    const allPreviouslyAssigned = new Set<string>([...beforeAssignees, ...afterAssignees]);
    for (const uid of allPreviouslyAssigned) {
      batch.delete(firestore.doc(`users/${uid}/my-work/${itemId}`));
    }
  } else {
    // Active path. If the item was previously deleted (soft-delete reversed,
    // rare but legal), treat as if all current assignees are additions.
    const effectiveBefore = wasActive ? beforeAssignees : new Set<string>();
    const additions = [...afterAssignees].filter((u) => !effectiveBefore.has(u));
    const removals = [...effectiveBefore].filter((u) => !afterAssignees.has(u));
    const persisted = [...afterAssignees].filter((u) => effectiveBefore.has(u));

    const mirror = sliceMirror(itemId, after!);

    for (const uid of [...additions, ...persisted]) {
      batch.set(firestore.doc(`users/${uid}/my-work/${itemId}`), mirror);
    }
    for (const uid of removals) {
      batch.delete(firestore.doc(`users/${uid}/my-work/${itemId}`));
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    logger.error(`[taskIndex] batch commit failed for ${itemId}`, err);
  }
});

/** Project the fields the My Stuff view needs onto a slim mirror doc.
 *  Keep this in sync with `MyWorkEntry` in src/types/index.ts. */
function sliceMirror(itemId: string, data: Record<string, unknown>) {
  return {
    workItemId: itemId,
    title: data.title ?? '',
    kind: data.kind ?? 'task',
    sourceTool: data.sourceTool ?? 'task',
    sourceRef: data.sourceRef ?? null,
    dueAt: data.dueAt ?? null,
    status: data.status ?? null,
    visibility: data.visibility ?? 'team',
    updatedAt: data.updatedAt ?? Date.now(),
  };
}
