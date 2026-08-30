import type { InvestmentType } from './InvestmentTypeSelector';

export function InvestmentTypeGuide({ type }: { type: InvestmentType }) {
  if (type === 'lump-sum') {
    return (
      <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm space-y-2">
        <div className="font-semibold text-blue-900">💰 Lump Sum Investment Setup</div>
        <p className="text-blue-800 text-xs">For a single investment at a specific time, use these columns:</p>
        <ul className="text-blue-800 text-xs space-y-1 ml-4 list-disc">
          <li>
            <strong>Fund/Stock Name</strong> (Text) - Name of what you invested in
          </li>
          <li>
            <strong>Amount Invested</strong> (Currency) - How much you invested
          </li>
          <li>
            <strong>Investment Date</strong> (Date) - When you invested
          </li>
          <li>
            <strong>Current Value</strong> (Currency) - Today's value (can use formula)
          </li>
          <li>
            <strong>Maturity Date</strong> (Date, optional) - When it matures
          </li>
          <li>
            <strong>Expected Return %</strong> (Percent, optional) - Your expected returns
          </li>
        </ul>
        <p className="text-blue-700 text-xs mt-2 italic">
          💡 Example: Invest ₹1,00,000 in a mutual fund on 2024-01-15
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3 text-sm space-y-2">
      <div className="font-semibold text-green-900">📊 SIP (Systematic Investment Plan) Setup</div>
      <p className="text-green-800 text-xs">For regular monthly investments, use these columns:</p>
      <ul className="text-green-800 text-xs space-y-1 ml-4 list-disc">
        <li>
          <strong>Fund/Scheme Name</strong> (Text) - Name of the SIP
        </li>
        <li>
          <strong>Monthly Amount</strong> (Currency) - Amount invested each month
        </li>
        <li>
          <strong>Investment Start Date</strong> (Date) - When you started the SIP
        </li>
        <li>
          <strong>Frequency</strong> (Text) - Monthly, Quarterly, Yearly, etc.
        </li>
        <li>
          <strong>Duration (Months)</strong> (Number) - How many months you'll invest
        </li>
        <li>
          <strong>Current Value</strong> (Currency) - Today's portfolio value
        </li>
        <li>
          <strong>Expected Annual Return %</strong> (Percent, optional) - Expected returns
        </li>
      </ul>
      <p className="text-green-700 text-xs mt-2 italic">
        💡 Example: ₹5,000/month for 60 months starting 2024-01-01
      </p>
    </div>
  );
}
