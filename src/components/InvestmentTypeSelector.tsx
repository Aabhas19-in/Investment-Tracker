export type InvestmentType = 'lump-sum' | 'sip';

export interface InvestmentTypeConfig {
  type: InvestmentType;
}

export function InvestmentTypeSelector({
  value,
  onChange,
}: {
  value: InvestmentType;
  onChange: (type: InvestmentType) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Investment Type</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange('lump-sum')}
          className={`flex-1 py-2.5 px-3 rounded-lg border-2 transition-all font-medium ${
            value === 'lump-sum'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          💰 Lump Sum
        </button>
        <button
          type="button"
          onClick={() => onChange('sip')}
          className={`flex-1 py-2.5 px-3 rounded-lg border-2 transition-all font-medium ${
            value === 'sip'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          📊 SIP
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {value === 'lump-sum'
          ? 'Single investment amount at a specific date'
          : 'Regular monthly investments (Systematic Investment Plan)'}
      </p>
    </div>
  );
}
