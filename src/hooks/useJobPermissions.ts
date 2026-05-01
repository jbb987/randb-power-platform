import { useMemo } from 'react';
import { useAuth } from './useAuth';
import type { ConstructionJob, ConstructionJobLevel } from '../types';

export interface JobPermissions {
  level: ConstructionJobLevel;
  canView: boolean;
  canEditBasicInfo: boolean;
  canManageTeam: boolean;
  canCreateTasks: boolean;
  canDeleteTasks: boolean;
  /** Status updates: PM/admin always; assignee on their own task. */
  canUpdateTaskStatus: (taskAssigneeId?: string) => boolean;
  canUploadPhotos: boolean;
  canDeletePhoto: (photoUploadedBy?: string) => boolean;
  canUploadDocuments: boolean;
  canDeleteDocuments: boolean;
  canEditTimeline: boolean;
  canDeleteJob: boolean;
}

/** Compute the current user's level on a given job, plus a flat permission map.
 *
 *  Permission model:
 *  - admin (global)    → sees and edits everything across all jobs
 *  - employee (global) → sees every job; edits a job only when they are its PM
 *  - worker (global)   → sees only jobs where they're the PM or in workerIds;
 *                        read-only on tasks/docs; can manage their own photos
 *                        and update status of tasks assigned to them. */
export function useJobPermissions(job: ConstructionJob | null | undefined): JobPermissions {
  const { user, role } = useAuth();

  return useMemo<JobPermissions>(() => {
    const denyAll: JobPermissions = {
      level: 'none',
      canView: false,
      canEditBasicInfo: false,
      canManageTeam: false,
      canCreateTasks: false,
      canDeleteTasks: false,
      canUpdateTaskStatus: () => false,
      canUploadPhotos: false,
      canDeletePhoto: () => false,
      canUploadDocuments: false,
      canDeleteDocuments: false,
      canEditTimeline: false,
      canDeleteJob: false,
    };
    if (!user || !role || !job) return denyAll;

    const isAdmin = role === 'admin';
    const isPm = job.projectManagerId === user.uid;
    const isWorkerMember = job.workerIds.includes(user.uid);
    const isEmployee = role === 'employee';
    // A worker can only see this job if they're a member; an employee sees
    // every job regardless of membership; admin sees everything.
    const canView = isAdmin || isEmployee || isPm || isWorkerMember;
    if (!canView) return denyAll;

    let level: ConstructionJobLevel;
    if (isAdmin) level = 'admin';
    else if (isPm) level = 'pm';
    else if (isWorkerMember) level = 'worker';
    else level = 'worker'; // employee viewing a job they're not on — treated like a read-only worker for permission shape

    const isAdminOrPm = isAdmin || isPm;

    return {
      level,
      canView,
      canEditBasicInfo: isAdminOrPm,
      canManageTeam: isAdminOrPm,
      // Tasks: only PM/admin can create or delete. Status updates carve out
      // an exception for the assignee so workers can still mark their own
      // task done without going through a PM.
      canCreateTasks: isAdminOrPm,
      canDeleteTasks: isAdminOrPm,
      canUpdateTaskStatus: (taskAssigneeId) => {
        if (isAdminOrPm) return true;
        return !!taskAssigneeId && taskAssigneeId === user.uid;
      },
      // Photos: looser on purpose. Anyone with view access can upload; the
      // uploader can delete their own; PM/admin can delete any.
      canUploadPhotos: canView,
      canDeletePhoto: (photoUploadedBy) => {
        if (isAdminOrPm) return true;
        return !!photoUploadedBy && photoUploadedBy === user.uid;
      },
      // Documents: PM/admin only for both upload and delete.
      canUploadDocuments: isAdminOrPm,
      canDeleteDocuments: isAdminOrPm,
      canEditTimeline: isAdminOrPm,
      canDeleteJob: isAdminOrPm,
    };
  }, [user, role, job]);
}
