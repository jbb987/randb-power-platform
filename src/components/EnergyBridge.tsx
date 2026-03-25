import { motion } from 'framer-motion';

interface Props {
  mw: number;
}

export default function EnergyBridge({ mw }: Props) {
  const flowDuration = 2.0 - ((mw - 10) / (1000 - 10)) * 1.0;

  return (
    <>
      {/* Desktop: horizontal */}
      <div className="hidden md:flex flex-col items-center gap-3 mx-4 min-w-[200px]">
        {/* MW badge — bigger */}
        <span className="text-sm font-heading font-bold text-[#201F1E]">
          +{mw} MW
        </span>

        <div className="relative w-full flex items-center justify-center">
          <svg viewBox="0 0 200 2" className="w-full h-[2px] absolute">
            <line x1="0" y1="1" x2="200" y2="1" stroke="#D8D5D0" strokeWidth="2" />
            <motion.line
              x1="0" y1="1" x2="200" y2="1"
              stroke="#ED202B"
              strokeWidth="2"
              strokeDasharray="6 8"
              strokeLinecap="round"
              animate={{ strokeDashoffset: [14, 0] }}
              transition={{ duration: flowDuration, repeat: Infinity, ease: 'linear' }}
            />
          </svg>

          <motion.div
            className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white border border-[#D8D5D0]"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#ED202B" stroke="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </motion.div>
        </div>
      </div>

      {/* Mobile: vertical */}
      <div className="flex md:hidden flex-col items-center gap-2 py-2">
        <span className="text-sm font-heading font-bold text-[#201F1E]">
          +{mw} MW
        </span>

        <div className="relative flex flex-col items-center justify-center h-[80px]">
          <svg viewBox="0 0 2 80" className="w-[2px] h-full absolute">
            <line x1="1" y1="0" x2="1" y2="80" stroke="#D8D5D0" strokeWidth="2" />
            <motion.line
              x1="1" y1="0" x2="1" y2="80"
              stroke="#ED202B"
              strokeWidth="2"
              strokeDasharray="6 8"
              strokeLinecap="round"
              animate={{ strokeDashoffset: [14, 0] }}
              transition={{ duration: flowDuration, repeat: Infinity, ease: 'linear' }}
            />
          </svg>

          <motion.div
            className="relative z-10 flex items-center justify-center w-10 h-10 rounded-full bg-white border border-[#D8D5D0]"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#ED202B" stroke="none">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </motion.div>
        </div>
      </div>
    </>
  );
}
