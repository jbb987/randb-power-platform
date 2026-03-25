import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { SiteInputs, AppraisalResult } from '../types';
import ValueCard from './ValueCard';
import EnergyBridge from './EnergyBridge';
import OutcomeBar from './OutcomeBar';
import PowerSlider from './PowerSlider';
import PowerScale from './PowerScale';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onSiteNameChange: (name: string) => void;
}

const MW_MIN = 10;
const MW_MAX = 1000;

function InlineEditName({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onChange(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className="text-lg font-heading font-bold text-[#201F1E] bg-transparent border-b-2 border-[#ED202B] outline-none py-0 px-0 min-w-[160px]"
        style={{ width: `${Math.max(draft.length, 10)}ch` }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-2 hover:opacity-80 transition no-print-button"
      title="Edit site name"
      aria-label="Edit site name"
    >
      <span className="text-lg font-heading font-bold text-[#201F1E]">
        {value || 'Site Appraisal'}
      </span>
      <svg
        className="w-3.5 h-3.5 text-[#D8D5D0] group-hover:text-[#ED202B] transition no-print"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
}

export default function PresentationView({ inputs, result, onMWChange, onSiteNameChange }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Hero — Screenshot target */}
      <div
        id="hero-capture"
        className="bg-white rounded-2xl border border-[#D8D5D0] shadow-lg shadow-black/5 overflow-hidden"
      >
        {/* Header row */}
        <div className="flex items-center px-6 pt-6 pb-3">
          <div className="flex items-baseline gap-3">
            <InlineEditName
              value={inputs.siteName}
              onChange={onSiteNameChange}
            />
            {inputs.totalAcres > 0 && (
              <span className="text-sm text-[#7A756E]">
                {inputs.totalAcres.toLocaleString()} acres
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-[#D8D5D0]" />

        {/* Cards + Bridge */}
        <div className="px-6 py-10 md:py-12">
          {/* Desktop: horizontal — equal-width cards */}
          <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] items-center gap-0">
            <div className="flex justify-center">
              <ValueCard
                label="Today"
                valueLow={result.currentValueLow}
                valueHigh={result.currentValueHigh}
                variant="current"
              />
            </div>

            <EnergyBridge mw={inputs.mw} />

            <div className="flex justify-center">
              <ValueCard
                label="Energized"
                value={result.energizedValue}
                variant="energized"
              />
            </div>
          </div>

          {/* Mobile: vertical — equal-width cards */}
          <div className="flex md:hidden flex-col items-center gap-0">
            <div className="w-full max-w-[300px]">
              <ValueCard
                label="Today"
                valueLow={result.currentValueLow}
                valueHigh={result.currentValueHigh}
                variant="current"
              />
            </div>

            <EnergyBridge mw={inputs.mw} />

            <div className="w-full max-w-[300px]">
              <ValueCard
                label="Energized"
                value={result.energizedValue}
                variant="energized"
              />
            </div>
          </div>

          {/* Outcome bar */}
          <OutcomeBar
            valueCreated={result.valueCreated}
            returnMultiple={result.returnMultiple}
          />
        </div>

        {/* MW Slider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mx-6 mb-2 pt-4 border-t border-[#D8D5D0]"
        >
          <PowerSlider
            value={inputs.mw}
            min={MW_MIN}
            max={MW_MAX}
            step={5}
            label="MW Delivered"
            formatValue={(v) => `${v} MW`}
            onChange={onMWChange}
          />
          <PowerScale />
        </motion.div>

      </div>
    </div>
  );
}
