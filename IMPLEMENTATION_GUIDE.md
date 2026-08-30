# Investment Type Selector Implementation Guide

## Overview
A new feature has been added to the Investment Tracker that allows users to select between **Lump Sum** and **SIP (Systematic Investment Plan)** investment types when adding or editing investment entries. This feature provides contextual field hints to guide users in organizing their investment data correctly.

## What Changed

### 1. **New Component: InvestmentTypeSelector**
   - **File**: `src/components/InvestmentTypeSelector.tsx`
   - **Purpose**: Renders a beautiful toggle selector for choosing between Lump Sum and SIP
   - **Features**:
     - Two visually distinct buttons with emoji indicators (💰 for Lump Sum, 📊 for SIP)
     - Color-coded styling (blue for Lump Sum, green for SIP)
     - Helpful description text explaining the difference
     - Fully accessible and responsive

### 2. **New Component: InvestmentTypeGuide**
   - **File**: `src/components/InvestmentTypeGuide.tsx`
   - **Purpose**: Displays recommended column structures for each investment type
   - **Contains**:
     - Detailed field recommendations for Lump Sum investments
     - Detailed field recommendations for SIP investments
     - Example use cases
     - Best practice guidance

### 3. **Enhanced RowEditor Component**
   - **File**: `src/components/RowEditor.tsx` (modified)
   - **Key Changes**:
     - Now imports and uses `InvestmentTypeSelector`
     - Tracks investment type state (`investmentType` state variable)
     - Detects if an "Investment Type" column exists in the sheet
     - Initializes investment type from stored data when editing
     - Provides contextual field hints based on selected investment type
     - Automatically updates the Investment Type column when selection changes

### 4. **Helper Function: getFieldHint**
   - **Location**: `src/components/RowEditor.tsx`
   - **Purpose**: Provides contextual hints for fields based on investment type
   - **Logic**:
     - For **SIP**: Shows hints for fields like "Monthly Amount", "Duration", "Start Date"
     - For **Lump Sum**: Shows hints for fields like "Amount Invested", "Investment Date", "Maturity Date"
     - Uses regex pattern matching to recognize common field names

### 5. **Updated Documentation**
   - **File**: `README.md` (modified)
   - **Added**: New section "2b. Investment Type: Lump Sum vs SIP"
   - **Contains**:
     - Explanation of both investment types
     - Recommended column structures
     - Use cases and examples

## How It Works

### User Flow

1. **Adding/Editing an Investment**:
   - User clicks "New entry" or "Edit entry" button
   - Row editor opens with the Investment Type selector at the top
   - User selects either "💰 Lump Sum" or "📊 SIP"

2. **Field Hints**:
   - As user selects an investment type, relevant fields show contextual hints
   - Example: If "Monthly Amount" column exists and SIP is selected, user sees:
     ```
     📊 For SIP: Enter your regular monthly investment amount
     ```

3. **Automatic Data Storage** (optional):
   - If the sheet contains an "Investment Type" column, the selection is automatically stored
   - Otherwise, it's purely a UI helper with no data impact

### Supported Column Name Patterns

The system automatically detects the Investment Type column by matching these patterns:
- `Investment Type`
- `Investment type`
- `Type Investment`
- `Type investment`
- And any variation with spaces/dashes

### Field Name Recognition

The `getFieldHint` function recognizes these patterns:

**For SIP**:
- `monthly`, `amount`, `installment`, `payment`, `contribution` → Shows SIP-specific hint
- `duration`, `months`, `tenure`, `period` → Shows SIP-specific hint
- `start`, `begin`, `from date` → Shows SIP-specific hint

**For Lump Sum**:
- `amount`, `principal`, `invested`, `investment` → Shows Lump Sum-specific hint
- `date`, `purchase`, `invested date` → Shows Lump Sum-specific hint
- `maturity`, `end`, `mature date` → Shows Lump Sum-specific hint

## Recommended Sheet Structure

### For Lump Sum Investments
```
Columns:
- Name (Text): Fund/Stock name
- Amount (Currency): Initial investment
- Date (Date): Investment date
- Current Value (Currency): Today's value
- Maturity Date (Date): Maturity date
- Return % (Percent): Expected returns
```

### For SIP Investments
```
Columns:
- Name (Text): Fund/Scheme name
- Monthly Amount (Currency): Amount per month
- Start Date (Date): When SIP started
- Frequency (Text): Monthly/Quarterly/Yearly
- Duration (Number): Number of months
- Current Value (Currency): Current portfolio value
- Annual Return % (Percent): Expected returns
```

## Implementation Details

### State Management
- `investmentType`: Tracks the currently selected investment type (defaults to 'lump-sum')
- `investmentTypeColIndex`: Stores the index of the Investment Type column (if it exists)
- `hasInvestmentTypeColumn`: Boolean flag for quick checks

### Type Definition
```typescript
export type InvestmentType = 'lump-sum' | 'sip';
```

### Integration Points
1. Displayed at the top of RowEditor, before all other fields
2. Skips rendering the Investment Type column field separately (if it exists)
3. Provides hints to all other fields based on selection
4. Updates the Investment Type column value when user changes selection

## User Benefits

1. **Better Data Organization**: Users understand what fields to use for each investment type
2. **Contextual Guidance**: Field hints appear based on investment type selection
3. **Reduced Confusion**: Clear visual separation between Lump Sum (blue) and SIP (green)
4. **Flexibility**: Works with any sheet structure; hints are optional
5. **Automatic Detection**: No setup required; works with any column naming variation
6. **Bidirectional Sync**: Selection updates stored data, and stored data updates selection

## Technical Stack
- React with TypeScript
- State management with `useState` and `useEffect`
- Regex pattern matching for field name detection
- Tailwind CSS for styling (with custom colors and transitions)

## Testing Recommendations

1. **Add New Lump Sum Entry**: Verify blue selector appears and hints update
2. **Add New SIP Entry**: Verify green selector appears and hints update
3. **Switch Between Types**: Verify hints update in real-time
4. **Edit Existing Entry**: Verify investment type is correctly loaded from data
5. **Create Investment Type Column**: Verify column is detected and used correctly
6. **Various Field Names**: Test with different column naming conventions

## Future Enhancement Ideas

1. **Smart Column Creation**: Suggest creating recommended columns based on investment type
2. **Calculation Helpers**: Show formulas for calculating total invested vs current value
3. **Goal Tracking**: Set and track goals for each investment type
4. **Performance Metrics**: Show different metrics based on investment type
5. **Alerts and Reminders**: Different reminder rules for SIP vs Lump Sum
6. **Migration Helpers**: Tools to convert between investment types
