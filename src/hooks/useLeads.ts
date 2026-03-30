import { useState, useCallback, useEffect } from 'react';
import type { Lead, LeadStatus, LeadNote } from '../types';
import { useAuth } from './useAuth';
import {
  saveLead,
  updateLeadStatus as updateStatusInDB,
  updateLeadFields as updateFieldsInDB,
  addLeadNote as addNoteInDB,
  deleteLead as deleteLeadFromDB,
  subscribeLeads,
} from '../lib/leads';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, role } = useAuth();

  useEffect(() => {
    const unsub = subscribeLeads(
      (remoteLeads) => {
        setLeads(remoteLeads);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  // Employees only see their assigned leads; admins see all
  const visibleLeads = role === 'admin'
    ? leads
    : leads.filter((l) => l.assignedTo === user?.uid);

  const createLead = useCallback(
    async (data: Omit<Lead, 'id' | 'notes' | 'createdAt' | 'updatedAt'>) => {
      const id = generateId();
      const lead: Lead = {
        ...data,
        id,
        notes: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveLead(lead);
      return id;
    },
    [],
  );

  const createLeadsBulk = useCallback(
    async (items: Omit<Lead, 'id' | 'notes' | 'createdAt' | 'updatedAt'>[]) => {
      const promises = items.map((data) => {
        const id = generateId();
        const lead: Lead = {
          ...data,
          id,
          notes: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return saveLead(lead);
      });
      await Promise.all(promises);
    },
    [],
  );

  const updateStatus = useCallback(
    async (id: string, status: LeadStatus) => {
      await updateStatusInDB(id, status);
    },
    [],
  );

  const updateLead = useCallback(
    async (id: string, fields: Partial<Lead>) => {
      await updateFieldsInDB(id, fields);
    },
    [],
  );

  const addNote = useCallback(
    async (leadId: string, text: string, authorId: string, authorName: string) => {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;
      const note: LeadNote = {
        id: generateId(),
        text,
        authorId,
        authorName,
        createdAt: Date.now(),
      };
      await addNoteInDB(leadId, [...lead.notes, note]);
    },
    [leads],
  );

  const removeLead = useCallback(
    async (id: string) => {
      await deleteLeadFromDB(id);
    },
    [],
  );

  const seedDemoLeads = useCallback(
    async () => {
      if (!user) return;
      const ownerName = user.email?.split('@')[0] || 'Unknown';
      const demoLeads: Omit<Lead, 'id' | 'notes' | 'createdAt' | 'updatedAt'>[] = [
        {
          assignedTo: user.uid,
          assignedToName: ownerName,
          businessName: 'SunField Energy Corp',
          phone: '(512) 555-0142',
          email: 'mthompson@sunfieldenergy.com',
          description: 'Mid-size solar farm operator looking to expand into Texas. 200-acre parcel under review.',
          decisionMakerName: 'Mark Thompson',
          decisionMakerRole: 'VP of Development',
          status: 'new',
        },
        {
          assignedTo: user.uid,
          assignedToName: ownerName,
          businessName: 'GreenGrid Solutions',
          phone: '(405) 555-0287',
          email: 'jcarter@greengridsol.com',
          description: 'Battery storage integrator exploring co-location with existing wind assets in Oklahoma.',
          decisionMakerName: 'Jessica Carter',
          decisionMakerRole: 'CEO',
          status: 'call_1',
        },
        {
          assignedTo: user.uid,
          assignedToName: ownerName,
          businessName: 'Prairie Wind Holdings',
          phone: '(316) 555-0193',
          email: 'rmorales@prairiewind.io',
          description: 'Independent power producer with 3 operational wind farms. Interested in PPA structuring.',
          decisionMakerName: 'Roberto Morales',
          decisionMakerRole: 'CFO',
          status: 'email_sent',
        },
      ];
      const promises = demoLeads.map((data) => {
        const id = generateId();
        const lead: Lead = { ...data, id, notes: [], createdAt: Date.now(), updatedAt: Date.now() };
        return saveLead(lead);
      });
      await Promise.all(promises);
    },
    [user],
  );

  return {
    leads: visibleLeads,
    loading,
    createLead,
    createLeadsBulk,
    updateStatus,
    updateLead,
    addNote,
    removeLead,
    seedDemoLeads,
  };
}
