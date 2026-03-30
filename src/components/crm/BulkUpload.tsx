import { useState, useRef } from 'react';
import type { LeadStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';

interface BulkLeadData {
  assignedTo: string;
  assignedToName: string;
  businessName: string;
  phone: string;
  email: string;
  description: string;
  decisionMakerName: string;
  decisionMakerRole: string;
  status: LeadStatus;
}

interface Props {
  onUpload: (leads: BulkLeadData[]) => void;
  onClose: () => void;
}

const CSV_HEADERS = ['businessName', 'decisionMakerName', 'decisionMakerRole', 'phone', 'email', 'description'];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+)/g)?.map((v) => v.trim().replace(/^"|"$/g, '')) || [];
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });
}

export default function BulkUpload({ onUpload, onClose }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError('No valid rows found. Check your CSV format.');
        return;
      }
      const missing = CSV_HEADERS.filter((h) => !Object.keys(rows[0]).includes(h));
      if (missing.length > 0) {
        setError(`Missing columns: ${missing.join(', ')}`);
        return;
      }
      setParsed(rows);
    };
    reader.readAsText(file);
  };

  const handleUpload = () => {
    if (!user || parsed.length === 0) return;
    const leads: BulkLeadData[] = parsed.map((row) => ({
      assignedTo: user.uid,
      assignedToName: user.email?.split('@')[0] || 'Unknown',
      businessName: row.businessName || '',
      phone: row.phone || '',
      email: row.email || '',
      description: row.description || '',
      decisionMakerName: row.decisionMakerName || '',
      decisionMakerRole: row.decisionMakerRole || '',
      status: 'new',
    }));
    onUpload(leads);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-[#D8D5D0] w-full max-w-lg">
        <div className="border-b border-[#D8D5D0] px-6 py-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-[#201F1E]">Bulk Upload Leads</h2>
          <button onClick={onClose} className="text-[#7A756E] hover:text-[#201F1E] transition p-1">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#7A756E] mb-2">CSV Format</label>
            <div className="bg-stone-50 rounded-lg p-3 text-xs font-mono text-[#7A756E] overflow-x-auto">
              {CSV_HEADERS.join(',')}
            </div>
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-[#D8D5D0] rounded-lg py-8 flex flex-col items-center gap-2 hover:border-[#ED202B]/40 transition"
            >
              <svg className="h-8 w-8 text-[#7A756E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span className="text-sm text-[#7A756E]">Click to select CSV file</span>
            </button>
          </div>

          {error && (
            <p className="text-sm text-[#EF4444] bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {parsed.length > 0 && (
            <div>
              <p className="text-sm text-[#201F1E] font-medium mb-2">
                {parsed.length} lead{parsed.length !== 1 ? 's' : ''} ready to import
              </p>
              <div className="max-h-40 overflow-y-auto bg-stone-50 rounded-lg p-2 space-y-1">
                {parsed.slice(0, 10).map((row, i) => (
                  <div key={i} className="text-xs text-[#7A756E] flex gap-2">
                    <span className="text-[#201F1E] font-medium">{row.businessName}</span>
                    <span>&middot;</span>
                    <span>{row.decisionMakerName}</span>
                    <span>&middot;</span>
                    <span>{row.phone}</span>
                  </div>
                ))}
                {parsed.length > 10 && (
                  <p className="text-xs text-[#7A756E] italic">...and {parsed.length - 10} more</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#7A756E] hover:text-[#201F1E] transition">
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={parsed.length === 0}
              className="bg-[#ED202B] text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-[#9B0E18] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Import {parsed.length > 0 ? `${parsed.length} Leads` : 'Leads'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
