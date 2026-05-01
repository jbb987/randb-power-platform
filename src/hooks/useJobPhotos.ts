import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteJobPhoto,
  subscribeJobPhotos,
  updateJobPhotoCaption,
  uploadJobPhoto,
  type UploadJobPhotoArgs,
} from '../lib/constructionPhotos';
import type { JobPhoto } from '../types';

export function useJobPhotos(jobId: string | undefined) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeJobPhotos(
      jobId,
      (p) => {
        setPhotos(p);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [jobId]);

  const upload = useCallback(
    async (args: Omit<UploadJobPhotoArgs, 'jobId'>) => {
      if (!jobId) throw new Error('No job ID');
      return uploadJobPhoto({ ...args, jobId });
    },
    [jobId],
  );

  const updateCaption = useCallback(
    async (photoId: string, caption: string) => {
      if (!jobId) throw new Error('No job ID');
      return updateJobPhotoCaption(jobId, photoId, caption);
    },
    [jobId],
  );

  const remove = useCallback(async (photo: JobPhoto) => {
    return deleteJobPhoto(photo);
  }, []);

  return useMemo(
    () => ({ photos, loading, upload, updateCaption, remove }),
    [photos, loading, upload, updateCaption, remove],
  );
}
