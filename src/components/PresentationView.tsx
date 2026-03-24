import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { SiteInputs, ValuationResult } from '../types';
import ValueCard from './ValueCard';
import EnergyBridge from './EnergyBridge';
import OutcomeBar from './OutcomeBar';
import PowerSlider from './PowerSlider';
import PowerScale from './PowerScale';

interface Props {
  inputs: SiteInputs;
  result: ValuationResult;
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
        className="text-sm font-semibold text-[#201F1E] bg-transparent border-b border-[#C1121F] outline-none py-0 px-0 min-w-[120px]"
        style={{ width: `${Math.max(draft.length, 10)}ch` }}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 hover:opacity-80 transition no-print-button"
      title="Edit site name"
      aria-label="Edit site name"
    >
      <span className="text-sm font-semibold text-[#201F1E]">
        {value || 'Site Valuation'}
      </span>
      <svg
        className="w-3 h-3 text-slate-300 group-hover:text-[#C1121F] transition no-print"
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
        className="bg-[#FAFAF8] rounded-2xl border border-[#D8D5D0] shadow-lg shadow-black/5 overflow-hidden"
      >
        {/* Header row */}
        <div className="flex items-center px-6 pt-5 pb-2">
          <div className="flex items-center gap-2.5">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt="R&B Power Platform"
              className="h-12 w-12 rounded-md object-contain"
            />
            <div className="flex items-baseline gap-3">
              <InlineEditName
                value={inputs.siteName}
                onChange={onSiteNameChange}
              />
              {inputs.totalAcres > 0 && (
                <span className="text-xs text-slate-400">
                  {inputs.totalAcres.toLocaleString()} acres
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-[#E8E6E3]" />

        {/* Cards + Bridge */}
        <div className="px-6 py-8 md:py-10">
          {/* Desktop: horizontal */}
          <div className="hidden md:flex items-center justify-center">
            <ValueCard
              label="Today"
              value={result.currentValue}
              ppa={inputs.currentPPA}
              variant="current"
            />

            <EnergyBridge
              mw={inputs.mw}
              buildCost={result.buildCost}
            />

            <ValueCard
              label="Energized"
              value={result.energizedValue}
              ppa={result.energizedPPA}
              variant="energized"
            />
          </div>

          {/* Mobile: vertical */}
          <div className="flex md:hidden flex-col items-center">
            <div className="w-full max-w-[260px]">
              <ValueCard
                label="Today"
                value={result.currentValue}
                ppa={inputs.currentPPA}
                variant="current"
              />
            </div>

            <EnergyBridge
              mw={inputs.mw}
              buildCost={result.buildCost}
            />

            <div className="w-full max-w-[300px]">
              <ValueCard
                label="Energized"
                value={result.energizedValue}
                ppa={result.energizedPPA}
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
          className="mx-6 mb-2 pt-4 border-t border-[#E8E6E3]"
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
