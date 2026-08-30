# Investment & Expense Tracker

A mobile-first React app that keeps **all** of your data in your own Google Sheets.
No backend, no database, no server-side code — the browser talks to the Google Sheets API directly.
Two separate workbooks: one for investments, one for expenses.

**Investments**

- Create a new sheet (tab) per asset — Gold, Stocks, Mutual Funds, anything — from the UI
- Add, rename, retype and delete columns per sheet, from the UI
- Add, edit and delete rows; values starting with `=` become live spreadsheet formulas
- Column types (Text / Money / Number / Percent / Date) stored as the sheet's own number format
- A Summary tab that totals your Money and Number columns and spots invested vs current value
- **Investment Type Selection**: When adding or editing an investment, select between **Lump Sum** (single investment) or **SIP** (Systematic Investment Plan) for contextual field hints

**Expenses**

- One tab per month (`Aug 2026`), created from a month picker
- A mandatory Date column, pre-filled with today and freely back-datable
- Your own categories, managed in a `Categories` tab and picked as tags when logging
- Spend broken down by category as bubbles, with exact amounts and shares

Both workbooks can be opened in Google Sheets or downloaded as a real `.xlsx` at any time.

**What the app stores:** a handful of settings in `localStorage` — the two spreadsheet IDs, the
OAuth client ID, the theme, and which totals you've dismissed. Nothing else. No rows, no totals,
no access token. The Google token lives in a JavaScript variable and dies with the tab.

---

## 1. One-time Google setup (~10 minutes, free, no billing)

You need this because **making a sheet "anyone with the link can edit" does not let an app write
to it.** Google allows anonymous *reads* of public sheets with an API key, but every *write*
requires a signed-in user. So the app signs you in with Google and writes as you.

### a. Create a project and enable the API

1. Go to <https://console.cloud.google.com/> and create a project (call it `Investment Tracker`).
2. **APIs & Services → Library** → search **Google Sheets API** → **Enable**.

### b. Configure the consent screen

3. Go to **APIs & Services → OAuth consent screen** (newer consoles call this
   **Google Auth Platform → Branding / Audience**).
   - User type: **External**
   - App name: `Investment Tracker`, support email: your own, developer email: your own
4. Under **Audience**, leave the publishing status as **Testing** and add your own Gmail address
   under **Test users**.

> Why Testing: the app asks for the `spreadsheets` scope, which Google classes as *sensitive*.
> Publishing to Production would require a verification review. In Testing mode you can use it
> yourself with no review — you'll just see a "Google hasn't verified this app" screen once, where
> you click **Advanced → Go to Investment Tracker (unsafe)**. That warning is about *your own*
> unverified app, and only test users you list can ever sign in.

### c. Create the OAuth client ID

5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins** — add both:
     - `http://localhost:5173`
     - `https://your-app-name.vercel.app` (add this after your first deploy)
   - Authorized redirect URIs: leave empty, this flow doesn't use them.
6. Copy the **Client ID** (`…apps.googleusercontent.com`).

> Origins must match exactly — no trailing slash, and `https` for the deployed one. Every time you
> add a domain, come back and add it here or sign-in will fail with `redirect_uri_mismatch` /
> `idpiframe_initialization_failed`.

---

## 2. Google Sheet settings

Good news: **almost nothing to change.**

| Setting | What to do |
| --- | --- |
| Sharing | **Leave it private.** Do *not* set "anyone with the link can edit" — the app writes as *you*, so your own access is all it needs. If you already made it public, you can revert it. |
| Ownership | Sign into the app with the Google account that owns (or has **Editor** access to) the sheet. |
| Row 1 | Row 1 of every tab is the **header row**. Don't put a title/logo row above it and don't merge cells in row 1. |
| Tabs | One tab per asset class. The app creates them for you with a bold, frozen header row. |
| Anything else | Formatting, colours, conditional formatting, extra formulas you add in Google Sheets — all fine, the app leaves them alone. |

Your sheet is already fine as-is:
`https://docs.google.com/spreadsheets/d/14Bs1ioiG5Iv5mkJeqIiBnFrGX6lz-uLi2BncBxwe-tk/edit`
(the long string in the middle is the **Spreadsheet ID** the app needs).

One thing worth doing: if that link is currently shared publicly, **turn sharing back off**.
A publicly editable sheet is editable by anyone who finds the link, and your investment records
probably shouldn't be.

---

## 2b. Investment Type: Lump Sum vs SIP

When adding or editing an investment entry, you'll see an **Investment Type selector** at the top of the form. This helps you organize your data correctly:

### Lump Sum Investments
Single investments made all at once. Best for:
- Fixed deposits
- One-time mutual fund purchases
- Bonds
- Real estate down payments

**Recommended columns:**
- Fund/Stock Name (Text)
- Amount Invested (Currency)
- Investment Date (Date)
- Current Value (Currency)
- Maturity Date (Date)
- Expected Return % (Percent)

### SIP (Systematic Investment Plan)
Regular monthly or periodic investments. Best for:
- Recurring mutual fund investments
- Monthly stock purchases
- Regular savings plans
- Dollar-cost averaging strategies

**Recommended columns:**
- Fund/Scheme Name (Text)
- Monthly Amount (Currency)
- Investment Start Date (Date)
- Frequency (Text: Monthly/Quarterly/Yearly)
- Duration (Months) (Number)
- Current Value (Currency)
- Expected Annual Return % (Percent)

> **Tip:** The investment type selector is purely a helper — it provides contextual hints for relevant fields based on your selection. Your actual data structure is determined by the columns you create.

---

## 3. Run it locally

```bash
cp .env.example .env.local     # then fill in your client ID
npm install
npm run dev
```

Open <http://localhost:5173>. To test on your phone, note the Network URL that Vite prints and open
it on a device on the same Wi-Fi — but sign-in only works on origins you registered, so add that
address to Authorized JavaScript origins too, or just test auth on localhost / the deployed URL.

If you'd rather not use `.env.local`, leave it out — the app's **Settings** tab lets you paste the
spreadsheet URL and client ID directly on first run.

---

## 4. Deploy to Vercel

1. Push this folder to GitHub.
2. On Vercel: **Add New → Project → import the repo**. Framework preset is detected as **Vite**.
3. Add two **Environment Variables** (they're public values baked into the bundle — that's normal
   and safe for browser OAuth; the JavaScript-origins allowlist is what protects the client ID):
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_SPREADSHEET_ID`
4. Deploy, then copy the production URL and add it to **Authorized JavaScript origins** in Google
   Cloud Console.
5. On your phone, open the URL → browser menu → **Add to Home Screen**. It runs full-screen like a
   native app.

> Vercel preview deployments get a new random URL each time, which won't be in your origins list,
> so sign-in will fail there. Use the production URL, or add a stable custom domain.

---

## 5. How it's put together

```
src/
  lib/googleAuth.ts   Google Identity Services token flow. Token in memory only.
  lib/sheets.ts       Sheets REST v4 wrapper: read, append, update, delete rows;
                      add/rename/retype/delete columns and tabs. Every call hits the API.
  lib/columnTypes.ts  Column types <-> Google Sheets number formats.
  lib/expenses.ts     Month-tab naming, date parsing, category helpers.
  lib/format.ts       Exact INR formatting and numeric parsing.
  lib/accent.ts       A stable colour per sheet and per category.
  lib/config.ts       The persisted settings.
  components/         DataView + Manage + RowEditor (investments),
                      ExpensesView + ExpenseEditor (expenses),
                      Summary, Settings, Icons, UI primitives.
```

### Live formulas

Rows are written with `valueInputOption=USER_ENTERED`, so typing `=E4*F4` into a field stores a
real spreadsheet formula. The table shows the calculated result; the editor shows the formula back
to you, so editing a row never silently flattens it into a number.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Could not load Google sign-in` | An ad/tracker blocker is blocking `accounts.google.com/gsi/client`. |
| `403 … has not been used in project` | Google Sheets API not enabled for the project. |
| `403 The caller does not have permission` | Signed in with an account that can't edit the sheet. |
| `404` | Wrong Spreadsheet ID in Settings. |
| Sign-in popup closes and nothing happens | The current origin isn't in Authorized JavaScript origins. |
| `access_denied` | Your Gmail isn't in the Test users list on the consent screen. |
| Signed out after an hour | Normal — tokens are short-lived. The app refreshes silently; if the Google session lapsed, tap sign in again. |
