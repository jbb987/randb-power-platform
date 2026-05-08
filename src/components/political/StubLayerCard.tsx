interface Props {
  layerNumber: 2 | 3 | 4 | 5;
  layerName: string;
  hint: string;
}

export default function StubLayerCard({ layerNumber, layerName, hint }: Props) {
  return (
    <div className="bg-stone-50 rounded-2xl border border-dashed border-[#D8D5D0] px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-[#7A756E]">
            Layer {layerNumber} of 5
          </span>
          <h3 className="font-heading text-sm font-semibold text-stone-500">{layerName}</h3>
        </div>
        <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded bg-stone-100 text-stone-500 ring-1 ring-stone-200">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-stone-500 mt-2">{hint}</p>
    </div>
  );
}
