import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteJobDocument,
  getJobDocumentBlob,
  getJobDocumentUrl,
  subscribeJobDocuments,
  uploadJobDocument,
  type UploadJobDocumentArgs,
} from '../lib/constructionDocuments';
import type { JobDocument } from '../types';

export function useJobDocuments(jobId: string | undefined) {
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeJobDocuments(
      jobId,
      (d) => {
        setDocuments(d);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [jobId]);

  const upload = useCallback(
    async (args: Omit<UploadJobDocumentArgs, 'jobId'>) => {
      if (!jobId) throw new Error('No job ID');
      return uploadJobDocument({ ...args, jobId });
    },
    [jobId],
  );

  const remove = useCallback(async (doc: JobDocument) => {
    return deleteJobDocument(doc);
  }, []);

  const openUrl = useCallback(async (doc: JobDocument) => {
    return getJobDocumentUrl(doc);
  }, []);

  const downloadBlob = useCallback(async (doc: JobDocument) => {
    return getJobDocumentBlob(doc);
  }, []);

  return useMemo(
    () => ({ documents, loading, upload, remove, openUrl, downloadBlob }),
    [documents, loading, upload, remove, openUrl, downloadBlob],
  );
}
