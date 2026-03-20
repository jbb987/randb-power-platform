import { motion } from 'framer-motion';
import { formatCurrencyShort } from '../utils/format';

interface Props {
  mw: number;
  buildCost: number;
}

/**
 * Energy particle with a comet-like trail effect.
 * Each particle is a small circle with a blurred gradient tail.
 */
function EnergyParticle({
  delay,
  duration,
  size,
  vertical,
}: {
  delay: number;
  duration: number;
  size: 'sm' | 'md' | 'lg';
  vertical?: boolean;
}) {
  const dims = { sm: 4, md: 6, lg: 8 }[size];
  const glow = { sm: 4, md: 8, lg: 12 }[size];
  const opacity = { sm: 0.5, md: 0.7, lg: 0.9 }[size];

  return (
    <motion.div
      className="absolute"
      style={{
        width: dims,
        height: dims,
        borderRadius: '50%',
        background: `radial-gradient(circle, #D4A832 0%, #C8972C 40%, transparent 70%)`,
        boxShadow: `0 0 ${glow}px rgba(212,168,50,${opacity}), 0 0 ${glow * 2}px rgba(212,168,50,${opacity * 0.3})`,
        left: vertical ? '50%' : undefined,
        top: vertical ? undefined : '50%',
        transform: vertical ? 'translateX(-50%)' : 'translateY(-50%)',
      }}
      animate={
        vertical
          ? { top: ['-4%', '104%'], opacity: [0, opacity, opacity, 0] }
          : { left: ['-4%', '104%'], opacity: [0, opacity, opacity, 0] }
      }
      transition={{
        duration,
        repeat: Infinity,
        delay,
        ease: 'linear',
      }}
    />
  );
}

/**
 * A pulsing glow that travels along the beam — gives it a "surge" feel.
 */
function EnergySurge({ duration, vertical }: { duration: number; vertical?: boolean }) {
  return (
    <motion.div
      className="absolute"
      style={{
        width: vertical ? '100%' : 40,
        height: vertical ? 20 : '100%',
        background: vertical
          ? 'radial-gradient(ellipse, rgba(212,168,50,0.4) 0%, transparent 70%)'
          : 'radial-gradient(ellipse, rgba(212,168,50,0.4) 0%, transparent 70%)',
        left: vertical ? 0 : undefined,
        top: vertical ? undefined : 0,
        transform: vertical ? undefined : undefined,
      }}
      animate={
        vertical
          ? { top: ['-20%', '120%'] }
          : { left: ['-15%', '115%'] }
      }
      transition={{
        duration: duration * 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/**
 * Pulsing glow on the beam track itself.
 */
function BeamPulse({ vertical }: { vertical?: boolean }) {
  return (
    <motion.div
      className={`absolute rounded-full ${
        vertical ? 'w-[5px] h-full left-1/2 -translate-x-1/2' : 'h-[5px] w-full top-1/2 -translate-y-1/2'
      }`}
      style={{
        background: vertical
          ? 'linear-gradient(to bottom, transparent, rgba(212,168,50,0.15), rgba(212,168,50,0.25), rgba(212,168,50,0.15), transparent)'
          : 'linear-gradient(to right, transparent, rgba(212,168,50,0.15), rgba(212,168,50,0.25), rgba(212,168,50,0.15), transparent)',
      }}
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export default function EnergyBridge({ mw, buildCost }: Props) {
  // Faster animation at higher MW
  const baseDuration = 2.2 - ((mw - 10) / (1000 - 10)) * 1.2;

  // Particle config — staggered sizes for depth
  const particles: { size: 'sm' | 'md' | 'lg'; delayOffset: number }[] = [
    { size: 'lg', delayOffset: 0 },
    { size: 'sm', delayOffset: 0.15 },
    { size: 'md', delayOffset: 0.4 },
    { size: 'sm', delayOffset: 0.6 },
    { size: 'md', delayOffset: 0.8 },
  ];

  return (
    <>
      {/* Desktop: horizontal bridge */}
      <div className="hidden md:flex flex-col items-center gap-1.5 mx-8 min-w-[160px]">
        <motion.span
          className="text-base font-bold text-[#9E7B23]"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          +{mw} MW
        </motion.span>

        {/* Beam track */}
        <div className="flex items-center gap-1 w-full">
          <div className="relative flex-1 h-[3px] bg-[#D4C9A8]/30 rounded-full overflow-hidden">
            <BeamPulse />
            <EnergySurge duration={baseDuration} />
            {particles.map((p, i) => (
              <EnergyParticle
                key={i}
                delay={baseDuration * p.delayOffset}
                duration={baseDuration}
                size={p.size}
              />
            ))}
          </div>
          {/* Animated arrow head */}
          <motion.svg
            width="10"
            height="12"
            viewBox="0 0 10 12"
            className="shrink-0 -ml-0.5"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M0 0L10 6L0 12Z" fill="#C8972C" />
          </motion.svg>
        </div>

        {/* Build cost */}
        <span className="text-[11px] text-[#A09A92]">
          {formatCurrencyShort(buildCost)} build
        </span>
      </div>

      {/* Mobile: vertical bridge */}
      <div className="flex md:hidden flex-col items-center gap-1 py-3">
        <motion.span
          className="text-base font-bold text-[#9E7B23]"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          +{mw} MW
        </motion.span>
        <div className="flex flex-col items-center gap-1">
          <div className="relative w-[3px] h-12 bg-[#D4C9A8]/30 rounded-full overflow-hidden">
            <BeamPulse vertical />
            <EnergySurge duration={baseDuration} vertical />
            {particles.slice(0, 3).map((p, i) => (
              <EnergyParticle
                key={i}
                delay={baseDuration * p.delayOffset}
                duration={baseDuration}
                size={p.size}
                vertical
              />
            ))}
          </div>
          <motion.svg
            width="12"
            height="10"
            viewBox="0 0 12 10"
            className="shrink-0 -mt-0.5"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M0 0L12 0L6 10Z" fill="#C8972C" />
          </motion.svg>
        </div>
        <span className="text-[11px] text-[#A09A92]">
          {formatCurrencyShort(buildCost)} build
        </span>
      </div>
    </>
  );
}
