# CSV data and Vercel uploads

The dashboard uses the four CSV files in this repository as its initial and fallback data. Approved updates are stored in a **private Vercel Blob store** and loaded through the site's Vercel Functions. Public submissions stay private in a review queue; they do not affect the dashboard until the owner approves them.

## One-time Vercel setup

1. In Vercel, open the dashboard project and create a Blob store with **Private** access. Connect the store to the project's Production environment (and Preview/Development if needed). A connected store supplies `BLOB_STORE_ID`; Vercel manages `VERCEL_OIDC_TOKEN` for deployed functions. The `BLOB_WEBHOOK_PUBLIC_KEY` variable is for verifying upload webhook signatures, not Blob API authentication.
2. In **Project → Settings → Environment Variables**, set `CSV_OWNER_PASSWORD` to a unique, randomly generated password of at least 32 characters. Keep it private; do not put it in this repository or share it with CSV submitters. Redeploy after setting environment variables.
3. Ensure the project is deployed from this repository and that Vercel Functions are enabled. The site uses `api/csv-files.js`, `api/csv-submissions.js`, and `api/owner-session.js`.
4. Configure Vercel Firewall rate limits for `POST /api/csv-submissions` and `POST /api/owner-session` to reduce upload spam and password guessing. Keep the 2 MB per-file limit in place.

Vercel Blob's read-write token and the owner password are only used by server-side functions; they must never be embedded in browser JavaScript. Do not use a public Blob store for the review queue.

## Submitting and approving files

Visitors open **Download CSV → Upload a CSV**, select one of the current datasets on the left, and submit a matching file on the right:

- `Year1.csv`
- `Year2.csv`
- `Year3.csv`
- `UpcomingTrips.csv`

The website validates the file name, CSV headers, row structure, required values, and 2 MB maximum. Submissions are stored privately and are visible only after the owner signs in with `CSV_OWNER_PASSWORD`. The owner can download a submission to inspect it on their computer, approve it to replace its selected live CSV, or delete it from the review queue. Approving updates the dashboard immediately; deleting a submission leaves live data unchanged.

The owner password creates an eight-hour, HttpOnly, SameSite cookie. Signing out clears that cookie. Use HTTPS on the deployed site.

## CSV format

Year 1, Year 2, and Year 3 CSVs must contain `Student ID`, `City`, `SubCategory`, and `Course` columns. Dashboard counts use unique student IDs within each category. Repeated IDs can appear in more than one subcategory. `DIT` and `DCS` display together as `DIT/DCS`.

The Upcoming Trips CSV must contain `City`, `Dates`, `Total Students`, `Year 1`, `Year 2`, and `Notes`; student totals must be whole numbers.

The bundled `UpcomingTrips.csv` sets Batam's note to “No additional note.”

## Privacy

Pending uploads are stored in private Blob storage and only the owner can list, approve, or delete them. The dashboard's approved CSVs are served by a public read endpoint because the dashboard and its CSV download controls show that data to visitors. Therefore approved CSVs, including Student IDs, are publicly retrievable. Confirm that publishing those records is permitted before deploying.

For local previews, the dashboard reads the bundled CSVs. The upload/review functions require deployment to Vercel with the private Blob store and environment variable configured.
