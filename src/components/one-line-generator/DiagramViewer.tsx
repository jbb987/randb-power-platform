/** Renders a generated one-line SVG string, scaled to fit the container width.
 *  The SVG carries its own viewBox, so width:100% keeps the aspect ratio. */
export default function DiagramViewer({ svg }: { svg: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#D8D5D0] shadow-sm overflow-auto p-3">
      <div
        className="[&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-full"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
