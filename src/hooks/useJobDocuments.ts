import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteJobDocument,
  getJobDocumentBlob,
  getJobDocumentUrl,
  subscribeJobDocuments,
  uploadJobDocument,
  type UploadJobDocumentArgs,
} from '../lib/constructionDocuments';
import { useJobToolConfig } from '../lib/jobToolConfig';
import type { JobDocument } from '../types';

export function useJobDocuments(jobId: string | undefined) {
  const config = useJobToolConfig();
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
      config.jobsCollection,
      jobId,
      (d) => {
        setDocuments(d);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [jobId, config.jobsCollection]);

  const upload = useCallback(
    async (args: Omit<UploadJobDocumentArgs, 'jobId'>) => {
      if (!jobId) throw new Error('No job ID');
      return uploadJobDocument(config.jobsCollection, config.docsStoragePrefix, {
        ...args,
        jobId,
      });
    },
    [jobId, config.jobsCollection, config.docsStoragePrefix],
  );

  const remove = useCallback(
    async (doc: JobDocument) => {
      return deleteJobDocument(config.jobsCollection, doc);
    },
    [config.jobsCollection],
  );

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
