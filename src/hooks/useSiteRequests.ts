import { useState, useCallback, useEffect } from 'react';
import type { SiteRequest, SiteRequestSite, SiteRequestStatus } from '../types';
import {
  saveSiteRequest,
  updateRequestStatus as updateStatusInDB,
  deleteSiteRequest as deleteRequestFromDB,
  subscribeSiteRequests,
} from '../lib/siteRequests';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useSiteRequests() {
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeSiteRequests(
      (remoteRequests) => {
        setRequests(remoteRequests);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  const addRequest = useCallback(
    async (customerName: string, sites: SiteRequestSite[], submittedBy: string, projectId: string) => {
      const id = generateId();
      const request: SiteRequest = {
        id,
        projectId,
        customerName,
        sites,
        status: 'new',
        submittedBy,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveSiteRequest(request);
      return id;
    },
    [],
  );

  const updateStatus = useCallback(
    async (id: string, status: SiteRequestStatus) => {
      await updateStatusInDB(id, status);
    },
    [],
  );

  const deleteRequest = useCallback(async (id: string) => {
    await deleteRequestFromDB(id);
  }, []);

  return { requests, loading, addRequest, updateStatus, deleteRequest };
}
