import type { SiteInputs, AppraisalResult } from '../../types';
import PresentationView from '../PresentationView';
import SiteMapCard from './SiteMapCard';

interface Props {
  inputs: SiteInputs;
  result: AppraisalResult;
  onMWChange: (mw: number) => void;
  onInputsChange: (inputs: SiteInputs) => void;
}

export default function SiteDetailPanel({ inputs, result, onMWChange, onInputsChange }: Props) {
  function set<K extends keyof SiteInputs>(key: K, value: SiteInputs[K]) {
    onInputsChange({ ...inputs, [key]: value });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <SiteMapCard coordinates={inputs.coordinates} />
      <PresentationView
        inputs={inputs}
        result={result}
        onMWChange={onMWChange}
        onSiteNameChange={(name) => set('siteName', name)}
      />
    </div>
  );
}
