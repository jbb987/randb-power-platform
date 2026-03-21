export default function PowerScale() {
  return (
    <div className="flex items-start justify-between w-full mt-2 px-0.5">
      <div className="text-left">
        <span className="text-[10px] text-[#A09A92] font-medium">10 MW</span>
        <span className="block text-[9px] text-[#C8C3BB]">Small solar</span>
      </div>
      <div className="text-center">
        <span className="text-[10px] text-[#A09A92] font-medium">250 MW</span>
        <span className="block text-[9px] text-[#C8C3BB]">Large solar / battery</span>
      </div>
      <div className="text-center">
        <span className="text-[10px] text-[#A09A92] font-medium">500 MW</span>
        <span className="block text-[9px] text-[#C8C3BB]">Industrial / compute</span>
      </div>
      <div className="text-center">
        <span className="text-[10px] text-[#A09A92] font-medium">750 MW</span>
        <span className="block text-[9px] text-[#C8C3BB]">Large-scale power</span>
      </div>
      <div className="text-right">
        <span className="text-[10px] text-[#A09A92] font-medium">1,000 MW</span>
        <span className="block text-[9px] text-[#C8C3BB]">Hyperscale DC</span>
      </div>
    </div>
  );
}
