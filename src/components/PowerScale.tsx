export default function PowerScale() {
  return (
    <div className="flex items-start justify-between w-full mt-2 px-0.5">
      <div className="text-left">
        <span className="text-[10px] text-[#7A756E] font-medium">10 MW</span>
        <span className="block text-[9px] text-[#7A756E]">Small solar</span>
      </div>
      <div className="text-center">
        <span className="text-[10px] text-[#7A756E] font-medium">250 MW</span>
        <span className="block text-[9px] text-[#7A756E]">Large solar / battery</span>
      </div>
      <div className="text-center">
        <span className="text-[10px] text-[#7A756E] font-medium">500 MW</span>
        <span className="block text-[9px] text-[#7A756E]">Industrial / compute</span>
      </div>
      <div className="text-center">
        <span className="text-[10px] text-[#7A756E] font-medium">750 MW</span>
        <span className="block text-[9px] text-[#7A756E]">Large-scale power</span>
      </div>
      <div className="text-right">
        <span className="text-[10px] text-[#7A756E] font-medium">1,000 MW</span>
        <span className="block text-[9px] text-[#7A756E]">Hyperscale DC</span>
      </div>
    </div>
  );
}
