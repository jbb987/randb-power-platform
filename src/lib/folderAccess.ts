import type { DocumentRecord, Folder, UserRole } from '../types';

/** Per-folder access enforcement — read/write gates for the folder system.
 *
 *  Model (matches the §7 spec in docs/architecture/folder-system-plan.md):
 *   • Admins always pass — no access list can lock an admin out.
 *   • An item's effective access list comes from the nearest ancestor in the
 *     `ancestorFolderIds` chain (or the item itself) that has a non-null
 *     `viewerUserIds` / `editorUserIds`. If nothing in the chain sets one,
 *     the default is "open" (any manager/labor with row-level access).
 *   • An explicitly empty array (`[]`) means "admin-only" — there are zero
 *     non-admin users who pass.
 *
 *  Enforcement is client-side for v1. Server-side Firestore rule walks of
 *  `ancestorFolderIds` are deferred to a follow-up PR. */

type AccessKind = 'viewer' | 'editor';

/** Walk up from the item through `ancestorFolderIds` and return the nearest
 *  non-null access list of the given kind. `undefined` means "no restriction
 *  anywhere up the chain → default-open." `[]` means "admin-only." */
export function findEffectiveAccessList(
  item: Folder | DocumentRecord,
  foldersById: Map<string, Folder>,
  kind: AccessKind,
): string[] | undefined {
  const fieldName = kind === 'viewer' ? 'viewerUserIds' : 'editorUserIds';

  // Item's own list wins if set.
  if (isFolder(item)) {
    const own = item[fieldName];
    if (own !== undefined) return own;
  } else {
    const own = item[fieldName];
    if (own !== undefined) return own;
  }

  // Walk ancestors nearest → root. `ancestorFolderIds` is ordered root → nearest,
  // so reverse-iterate.
  const chain = item.ancestorFolderIds ?? [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const parent = foldersById.get(chain[i]);
    if (!parent) continue;
    const parentList = parent[fieldName];
    if (parentList !== undefined) return parentList;
  }

  return undefined;
}

function isFolder(x: Folder | DocumentRecord): x is Folder {
  return 'parentFolderId' in x;
}

/** Can the given user READ this folder/doc? Admins always true; otherwise
 *  the effective viewer list (if any) must include the user. */
export function canViewItem(
  item: Folder | DocumentRecord,
  foldersById: Map<string, Folder>,
  role: UserRole | null,
  userId: string | undefined,
): boolean {
  if (role === 'admin') return true;
  if (!userId) return false;
  const list = findEffectiveAccessList(item, foldersById, 'viewer');
  if (list === undefined) return true; // default-open
  return list.includes(userId);
}

/** Can the given user WRITE this folder/doc (upload, rename, archive)?
 *  Admins always true; otherwise the effective editor list must include the
 *  user. Defaults to: manager+ can edit when no editor list is set. */
export function canEditItem(
  item: Folder | DocumentRecord,
  foldersById: Map<string, Folder>,
  role: UserRole | null,
  userId: string | undefined,
): boolean {
  if (role === 'admin') return true;
  if (!userId) return false;
  const list = findEffectiveAccessList(item, foldersById, 'editor');
  if (list === undefined) {
    // Default-open for managers; labor needs explicit grant.
    return role === 'manager';
  }
  return list.includes(userId);
}

/** Describes how an item's access is currently set, for the Manage Access UI. */
export type AccessMode = 'inherit' | 'admin-only' | 'specific';

export function classifyAccessMode(list: string[] | undefined): AccessMode {
  if (list === undefined) return 'inherit';
  if (list.length === 0) return 'admin-only';
  return 'specific';
}

/** Turn the UI mode + selected user list back into a stored field value.
 *  `null` is returned for `inherit` so the caller knows to write `null` to
 *  Firestore (which removes the field on update). */
export function accessModeToFieldValue(
  mode: AccessMode,
  selectedUserIds: string[],
): string[] | null {
  if (mode === 'inherit') return null;
  if (mode === 'admin-only') return [];
  return selectedUserIds;
}
