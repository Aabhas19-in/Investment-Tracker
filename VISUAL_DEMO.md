# 🎨 Visual Demo: Investment Type Selector

## What Users Will See

### Screenshot 1: Opening the Entry Form

```
┌─────────────────────────────────────────────┐
│  Investment Tracker                     ✕   │
│                                             │
│  ┌─ Edit entry ──────────────────────────┐ │
│  │                                       │ │
│  │ 📌 Investment Type                    │ │
│  │                                       │ │
│  │ ┌──────────────────┬──────────────────┐│ │
│  │ │  💰 Lump Sum     │    📊 SIP        ││ │
│  │ └──────────────────┴──────────────────┘│ │
│  │ Single investment amount at a         │ │
│  │ specific date                         │ │
│  │                                       │ │
│  │ ────────────────────────────────────  │ │
│  │                                       │ │
│  │ Fund Name                             │ │
│  │ [________________________]             │ │
│  │                                       │ │
│  │ Amount Invested                       │ │
│  │ [________________________] | CUR |    │ │
│  │ 💰 For Lump Sum: The total amount    │ │
│  │ you invested at once                 │ │
│  │                                       │ │
│  │ Investment Date                       │ │
│  │ [___/___/___] 📅                      │ │
│  │ 💰 For Lump Sum: The date of your    │ │
│  │ single investment                    │ │
│  │                                       │ │
│  │ Current Value                         │ │
│  │ [________________________] | CUR |    │ │
│  │                                       │ │
│  │      ┌────────┐    ┌──────────────┐  │ │
│  │      │ Cancel │    │ Save to sheet│  │ │
│  │      └────────┘    └──────────────┘  │ │
│  │                                       │ │
│  └───────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### Screenshot 2: Switching to SIP

```
┌─────────────────────────────────────────────┐
│  Investment Tracker                     ✕   │
│                                             │
│  ┌─ Edit entry ──────────────────────────┐ │
│  │                                       │ │
│  │ 📌 Investment Type                    │ │
│  │                                       │ │
│  │ ┌──────────────────┬──────────────────┐│ │
│  │ │  💰 Lump Sum     │ 📊 SIP ✓         ││ │  ← User clicked SIP
│  │ └──────────────────┴──────────────────┘│ │
│  │ Regular monthly investments           │ │
│  │ (Systematic Investment Plan)          │ │
│  │                                       │ │
│  │ ────────────────────────────────────  │ │
│  │                                       │ │
│  │ Fund Name                             │ │
│  │ [________________________]             │ │
│  │                                       │ │
│  │ Monthly Amount                        │ │
│  │ [________________________] | CUR |    │ │
│  │ 📊 For SIP: Enter your regular       │ │  ← Hint changed!
│  │ monthly investment amount             │ │
│  │                                       │ │
│  │ Investment Start Date                 │ │
│  │ [___/___/___] 📅                      │ │
│  │ 📊 For SIP: Date when you start      │ │  ← Hint changed!
│  │ making regular investments            │ │
│  │                                       │ │
│  │ Duration (Months)                     │ │
│  │ [________________________] | # |      │ │
│  │ 📊 For SIP: Number of months you     │ │  ← New hint appeared!
│  │ plan to invest                        │ │
│  │                                       │ │
│  │ Frequency                             │ │
│  │ [________________________]             │ │
│  │                                       │ │
│  │      ┌────────┐    ┌──────────────┐  │ │
│  │      │ Cancel │    │ Save to sheet│  │ │
│  │      └────────┘    └──────────────┘  │ │
│  │                                       │ │
│  └───────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### Screenshot 3: Mobile View

```
┌──────────────────────────┐
│ Investment Tracker   ✕   │
│                          │
│ ┌─ New entry ──────────┐ │
│ │                      │ │
│ │ Investment Type      │ │
│ │                      │ │
│ │ ┌──────────────────┐ │ │
│ │ │ 💰 Lump Sum      │ │ │
│ │ └──────────────────┘ │ │
│ │ ┌──────────────────┐ │ │  ← Two-column layout
│ │ │  📊 SIP          │ │ │
│ │ └──────────────────┘ │ │
│ │ Single investment    │ │
│ │ at a specific date   │ │
│ │                      │ │
│ │ ────────────────────│ │
│ │                      │ │
│ │ Fund Name            │ │
│ │ [______________]     │ │
│ │                      │ │
│ │ Amount Invested      │ │
│ │ [______________]     │ │
│ │ 💰 For Lump Sum:    │ │
│ │ The total amount     │ │
│ │ you invested at once │ │
│ │                      │ │
│ │ Investment Date      │ │
│ │ [__/___/___] 📅     │ │
│ │                      │ │
│ │ ┌──────┐ ┌────────┐ │ │
│ │ │Cancel│ │  Save  │ │ │
│ │ └──────┘ └────────┘ │ │
│ │                      │ │
│ └──────────────────────┘ │
│                          │
└──────────────────────────┘
```

## Color Scheme

### Lump Sum (Selected)
```
Button: 
  Border: #3B82F6 (Blue 500)
  Background: #EFF6FF (Blue 50)
  Text: #1E40AF (Blue 700)
  Emoji: 💰
  
Hints:
  Icon: 💰
  Color: Blue tones
```

### SIP (Selected)
```
Button:
  Border: #22C55E (Green 500)
  Background: #F0FDF4 (Green 50)
  Text: #166534 (Green 700)
  Emoji: 📊
  
Hints:
  Icon: 📊
  Color: Green tones
```

### Unselected
```
Button:
  Border: #E5E7EB (Gray 200)
  Background: #FFFFFF (White)
  Text: #4B5563 (Gray 600)
  Hover: #D1D5DB (Gray 300)
```

## Interaction States

### State 1: Initial Load (Default)
```
Selector defaults to "💰 Lump Sum"
All hints are for Lump Sum fields
User can switch to SIP by clicking the button
```

### State 2: User Selects SIP
```
Animation:
  - Green button becomes selected
  - SIP hint text appears below
  - All field hints update to show SIP guidance
  - Any previously filled fields keep their values
```

### State 3: User Switches Back to Lump Sum
```
Animation:
  - Blue button becomes selected
  - Lump Sum hint text appears below
  - All field hints update to show Lump Sum guidance
  - No data loss
```

### State 4: User Saves
```
If "Investment Type" column exists:
  - Selection value is saved as "Lump Sum" or "SIP"
  - Column is updated with the selection
  
If no "Investment Type" column:
  - Selection is not persisted (UI helper only)
  - Other field values are saved normally
```

## Field Hint Examples

### Lump Sum Hints
```
Amount Invested → 💰 For Lump Sum: The total amount you invested at once
Investment Date → 💰 For Lump Sum: The date of your single investment  
Maturity Date → 💰 For Lump Sum: When your investment matures or is due
Current Value → (No hint - not type-specific)
```

### SIP Hints
```
Monthly Amount → 📊 For SIP: Enter your regular monthly investment amount
Start Date → 📊 For SIP: Date when you start making regular investments
Duration → 📊 For SIP: Number of months you plan to invest
Frequency → (No hint - not type-specific)
```

## Animation & Transitions

### Button Click
```
Duration: 200ms
Type: Ease-in-out
Changes:
  - Border color transitions
  - Background color transitions  
  - Text color transitions
  - Scale slightly (optional)
```

### Hint Appearance
```
Duration: Instant
Type: Fade in
Appears when:
  - Investment type selected
  - Field name matches pattern
  - Relevant to current selection
```

### Form Update
```
Duration: 200ms
Type: Cross-fade
When switching types:
  - Old hints fade out
  - New hints fade in
  - Field values remain unchanged
```

## Accessibility

### Keyboard Navigation
```
Tab → Navigate to selector
Space/Enter → Toggle selection
Tab → Navigate to first field
```

### Screen Reader
```
"Investment Type, group"
"💰 Lump Sum button, selected"
"📊 SIP button"
"Single investment amount at a specific date"
"Fund Name field"
"Amount Invested field, Currency"
"For Lump Sum: The total amount you invested at once"
```

### Touch Targets
```
Button size: 44px minimum height (mobile friendly)
Padding: 10px on all sides
Spacing: 8px between buttons
```

## Responsive Behavior

### Desktop (> 768px)
```
- Two-column button layout
- Full-width form fields
- Hints displayed inline
- Ample spacing
```

### Tablet (460-768px)
```
- Two-column button layout (stacked slightly)
- Form fields take 90% width
- Hints displayed below fields
- Comfortable spacing
```

### Mobile (< 460px)
```
- Two-column button layout (full width each)
- Form fields full width
- Hints wrapped text
- Compact spacing
- Touch-optimized 44px buttons
```

## User Feedback

### Visual Feedback
```
On Selection:
  ✅ Button border glows
  ✅ Background color changes
  ✅ Text color changes
  ✅ Hints update immediately
  ✅ Description changes
```

### Confirmation Feedback
```
No explicit confirmation needed:
  - Selection immediately applies hints
  - Can switch back anytime
  - No data loss
```

## Example Complete Entry

### Lump Sum Entry (Filled Out)
```
Investment Type: 💰 Lump Sum (selected)

Fund Name: HDFC Bank FD
Amount Invested: 100,000
Investment Date: 15/01/2024
Current Value: 103,250
Maturity Date: 15/01/2025
Expected Return %: 6.5
Status: Ongoing

[Saved in Google Sheets]
```

### SIP Entry (Filled Out)
```
Investment Type: 📊 SIP (selected)

Fund Name: Axis Bluechip Fund
Monthly Amount: 5,000
Investment Start Date: 01/01/2024
Frequency: Monthly
Duration (Months): 60
Current Value: 315,000
Expected Annual Return %: 12

[Saved in Google Sheets]
```

---

This visual demo shows how intuitive and user-friendly the Investment Type Selector feature is! 🎉
