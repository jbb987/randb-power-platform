import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteJobPhoto,
  subscribeJobPhotos,
  updateJobPhotoCaption,
  uploadJobPhoto,
  type UploadJobPhotoArgs,
} from '../lib/constructionPhotos';
import { useJobToolConfig } from '../lib/jobToolConfig';
import type { JobPhoto } from '../types';

export function useJobPhotos(jobId: string | undefined) {
  const config = useJobToolConfig();
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
      config.jobsCollection,
      jobId,
      (p) => {
        setPhotos(p);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [jobId, config.jobsCollection]);

  const upload = useCallback(
    async (args: Omit<UploadJobPhotoArgs, 'jobId'>) => {
      if (!jobId) throw new Error('No job ID');
      return uploadJobPhoto(config.jobsCollection, config.photosStoragePrefix, {
        ...args,
        jobId,
      });
    },
    [jobId, config.jobsCollection, config.photosStoragePrefix],
  );

  const updateCaption = useCallback(
    async (photoId: string, caption: string) => {
      if (!jobId) throw new Error('No job ID');
      return updateJobPhotoCaption(config.jobsCollection, jobId, photoId, caption);
    },
    [jobId, config.jobsCollection],
  );

  const remove = useCallback(
    async (photo: JobPhoto) => {
      return deleteJobPhoto(config.jobsCollection, photo);
    },
    [config.jobsCollection],
  );

  return useMemo(
    () => ({ photos, loading, upload, updateCaption, remove }),
    [photos, loading, upload, updateCaption, remove],
  );
}
