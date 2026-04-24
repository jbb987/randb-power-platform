import { useCallback, useEffect, useState } from 'react';
import type { CrmDocument, DocumentCategory } from '../types';
import { ACCEPTED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES } from '../types';
import { useAuth } from './useAuth';
import {
  uploadDocument,
  deleteDocument as deleteDocumentFromBackend,
  subscribeDocumentsByCompany,
  getDocumentUrl,
  getDocumentBlob,
} from '../lib/crmDocuments';

export function useCompanyDocuments(companyId: string | undefined) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(companyId != null);
  const [lastId, setLastId] = useState<string | undefined>(companyId);

  if (lastId !== companyId) {
    setLastId(companyId);
    setDocuments([]);
    setLoading(companyId != null);
  }

  useEffect(() => {
    if (!companyId) return;
    const unsub = subscribeDocumentsByCompany(
      companyId,
      (remote) => {
        setDocuments(remote);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [companyId]);

  const upload = useCallback(
    async (file: File, category: DocumentCategory) => {
      if (!user) throw new Error('Must be logged in to upload');
      if (!companyId) throw new Error('No company selected');
      if (file.size > MAX_DOCUMENT_BYTES) {
        throw new Error(`File is too large. Max is ${(MAX_DOCUMENT_BYTES / 1024 / 1024).toFixed(0)} MB.`);
      }
      if (!ACCEPTED_DOCUMENT_MIME.includes(file.type)) {
        throw new Error('Unsupported file type. Use PDF or JPG/PNG/WEBP images.');
      }
      return uploadDocument({
        file,
        companyId,
        category,
        uploadedBy: user.uid,
        uploadedByName: user.displayName || user.email || 'Unknown',
      });
    },
    [companyId, user],
  );

  const remove = useCallback(
    async (document: CrmDocument) => {
      await deleteDocumentFromBackend(document);
    },
    [],
  );

  const openUrl = useCallback(
    async (document: CrmDocument) => {
      return getDocumentUrl(document);
    },
    [],
  );

  const downloadBlob = useCallback(
    async (document: CrmDocument) => {
      return getDocumentBlob(document);
    },
    [],
  );

  return { documents, loading, upload, remove, openUrl, downloadBlob };
}
