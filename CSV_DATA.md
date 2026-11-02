# CSV data guide

The repository includes these four CSV files as the initial and fallback dashboard data:

- `Year1.csv`
- `Year2.csv`
- `Year3.csv`
- `UpcomingTrips.csv`

The dashboard fetches the files when it opens, refreshes them every minute, and has a refresh button for immediate updates. The Download CSV menu downloads the source files currently shown on the page.

## Student CSV columns

The Year 1, Year 2, and Year 3 files must include `Student ID`, `City`, `SubCategory`, and `Course`. Other columns are allowed and are preserved in downloads. Student IDs are used to count distinct students within each year, subcategory, city, and course; they are not displayed in the dashboard. Repeated IDs can appear in more than one subcategory, so subcategory counts may not add up to the overall unique-student total. Empty city values are displayed as “Not specified”; surrounding and repeated whitespace is trimmed for display and counting.

DIT and DCS are combined as `DIT/DCS` in the course charts.

## Upcoming trips CSV columns

`UpcomingTrips.csv` must include `City`, `Dates`, `Total Students`, `Year 1`, `Year 2`, and `Notes`. The three count columns must contain whole numbers. Keep notes in CSV quotes if they contain commas.

## Vercel upload setup

The **Upload updated CSV** option becomes available after the project is connected to a Vercel Blob store and redeployed. In the Vercel project, create and connect a Blob store, then add an `UPLOAD_PASSWORD` environment variable containing a randomly generated password of at least 24 characters. Set it for the Production environment (and Preview/Development only if needed), then redeploy. The Blob SDK uses the store credentials linked by Vercel; no storage key or upload password belongs in browser code or this repository.

From the website, choose **Download CSV → Upload updated CSV**, select the dataset to replace, choose the new `.csv` file, and enter the upload password. The website checks the required columns and replaces that shared live file for everyone. Files larger than 2 MB are rejected. Keep using the listed filenames and column headers. The existing CSV files remain as fallback defaults; uploaded versions take precedence.

The upload password restricts writes only; it does not make the dashboard or CSV files private. Uploaded Blob files are public so the dashboard can display them, just like the current static CSVs. Student files include Student IDs. Anyone who can access the public website can also retrieve those IDs from its CSV sources. Do not publish these files unless your organization has approved that access. If student data must be private, the dashboard and file reads must also require authenticated access.

## Hosting and local use

The page must be served from a web server or static host for browser CSV fetching to work; opening `index.html` directly with a `file://` URL is blocked by browser security. Without a connected Blob store, the page reads the CSV files deployed alongside it, but website uploads are disabled. The dashboard does not render student IDs or names.
