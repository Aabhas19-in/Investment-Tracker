# Quick Start: Using Investment Type Selector

## What's New?
When you add or edit an investment entry in the app, you'll now see an **Investment Type selector** at the top of the form. This helps you organize your investments correctly by choosing whether you made a **Lump Sum** or **SIP** investment.

## How to Use

### Step 1: Open the Investment Form
- Click **"+ New entry"** to add a new investment, or
- Click on an existing investment to edit it

### Step 2: Select Your Investment Type
You'll see two buttons at the top of the form:

```
┌─────────────────┬─────────────────┐
│  💰 Lump Sum    │    📊 SIP       │
└─────────────────┴─────────────────┘
```

**Choose ONE:**
- **💰 Lump Sum**: For single, one-time investments
- **📊 SIP**: For regular, recurring monthly investments

### Step 3: Fill in the Fields
Based on your selection, you'll see helpful hints next to relevant fields:

#### If you chose 💰 Lump Sum:
- **Amount Invested**: Shows → "💰 For Lump Sum: The total amount you invested at once"
- **Investment Date**: Shows → "💰 For Lump Sum: The date of your single investment"
- **Maturity Date**: Shows → "💰 For Lump Sum: When your investment matures or is due"

#### If you chose 📊 SIP:
- **Monthly Amount**: Shows → "📊 For SIP: Enter your regular monthly investment amount"
- **Duration (Months)**: Shows → "📊 For SIP: Number of months you plan to invest"
- **Start Date**: Shows → "📊 For SIP: Date when you start making regular investments"

### Step 4: Save
Click **"Save to sheet"** to save your investment.

---

## Example Scenarios

### Scenario 1: Fixed Deposit (Lump Sum)
```
Form opens → You select "💰 Lump Sum"

Fields shown with hints:
- Bank Name: State Bank of India
- Amount: 1,00,000 (hint: 💰 For Lump Sum: The total amount...)
- Date: 2024-01-15 (hint: 💰 For Lump Sum: The date of your single...)
- Maturity: 2025-01-15 (hint: 💰 For Lump Sum: When your investment...)
- Interest Rate: 6.5%

Result: One investment of ₹1,00,000 tracked
```

### Scenario 2: Monthly Mutual Fund SIP
```
Form opens → You select "📊 SIP"

Fields shown with hints:
- Fund Name: HDFC Top 100
- Monthly Amount: 5,000 (hint: 📊 For SIP: Enter your regular monthly...)
- Start Date: 2024-01-01 (hint: 📊 For SIP: Date when you start...)
- Duration: 60 (hint: 📊 For SIP: Number of months...)
- Frequency: Monthly
- Expected Return: 12%

Result: ₹5,000/month for 60 months tracked
```

### Scenario 3: Stock Purchase (Lump Sum)
```
Form opens → You select "💰 Lump Sum"

Fields shown:
- Stock Name: Reliance Industries
- Shares: 100
- Price per Share: 2,500
- Total Invested: 2,50,000
- Purchase Date: 2024-06-15
- Current Value: (auto-calculated)
```

---

## Tips & Tricks

### 💡 Tip 1: The hints are smart!
The app reads your column names and shows hints only for relevant fields. Use common names like:
- For SIP: "Monthly Amount", "Duration", "Start Date"
- For Lump Sum: "Amount", "Investment Date", "Maturity"

### 💡 Tip 2: You can switch types
Changed your mind? Click the other button — the hints update instantly.

### 💡 Tip 3: Creates your own structure
The investment type selector doesn't force you to use specific columns. You decide which columns to create. The hints are just helpers based on your column names.

### 💡 Tip 4: Storing the selection (Advanced)
If you add a column named **"Investment Type"**, your selection will be automatically saved with each entry. When you edit later, it'll remember your choice.

### 💡 Tip 5: Mix both types
You can have both Lump Sum and SIP investments in the same sheet! Just select the appropriate type when adding each one.

---

## Common Field Names Reference

The app recognizes these field names and shows appropriate hints:

| Field Name | Type | Hint Shows For |
|-----------|------|----------------|
| Amount, Invested, Investment | Any | Both types (context-specific) |
| Monthly Amount, Monthly Investment | Currency | SIP ✅ |
| Investment Date, Purchase Date | Date | Lump Sum ✅ |
| Start Date, Investment Start | Date | SIP ✅ |
| Maturity Date, End Date | Date | Lump Sum ✅ |
| Duration, Months, Tenure | Number | SIP ✅ |
| Installment, Contribution | Currency | SIP ✅ |

> **Note**: Column names aren't case-sensitive and work with slight variations. "Monthly amount", "MONTHLY AMOUNT", "Monthly_Amount" all work the same.

---

## Example Sheet Setup

### For Lump Sum Focus:
```
Sheet: "Gold"
- Name (Text)
- Amount (Currency)
- Purchase Date (Date)
- Current Value (Currency)
- Expected Maturity (Date)
```

### For SIP Focus:
```
Sheet: "Mutual Funds"
- Fund Name (Text)
- Monthly Amount (Currency)
- Start Date (Date)
- Duration (Months) (Number)
- Frequency (Text)
- Current Value (Currency)
- Expected Return % (Percent)
```

### Mixed:
```
Sheet: "All Investments"
- Investment Name (Text)
- Investment Type (Text) ← Auto-stores your selection!
- Amount (Currency)
- Investment Date (Date)
- Monthly Amount (Currency)
- Duration (Months) (Number)
- Current Value (Currency)
```

---

## Troubleshooting

**Q: I don't see the Investment Type selector**
- A: The selector appears once you have at least one column created in your sheet.

**Q: The hints aren't showing for my column**
- A: Check that your column name matches common field names (see reference table above). Try renaming to something more standard.

**Q: Can I add a column to store the investment type?**
- A: Yes! Add a "Text" column called "Investment Type" and the app will automatically store your selection.

**Q: I want to see all fields regardless of type**
- A: The hints are just suggestions — all fields appear regardless. The selector just provides guidance.

**Q: Can I change the investment type later?**
- A: Yes! Edit the entry, click the other button, and save. If you have an "Investment Type" column, it updates automatically.

---

## Next Steps

1. Open the **Investments** tab in the app
2. Click on a sheet to create a new entry
3. Look for the blue/green Investment Type buttons at the top
4. Choose your investment type
5. Fill in the fields with guidance from the helpful hints
6. Click "Save to sheet"

Happy investing! 🚀📈
