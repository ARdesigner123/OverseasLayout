# Supabase setup

The dashboard reads aggregate rows directly from `public.overseas_student_statistics` using the browser-safe publishable key in `supabase-config.js`. A service-role key is not used.

## Allow the dashboard to read the table

The REST endpoint currently returns HTTP 200 but no rows to the publishable key. Since you confirmed records exist, the likely issue is missing `anon` SELECT permission or an RLS policy. Run this in the Supabase SQL Editor:

```sql
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.overseas_student_statistics TO anon;

ALTER TABLE public.overseas_student_statistics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read overseas aggregate statistics"
ON public.overseas_student_statistics;

CREATE POLICY "Public can read overseas aggregate statistics"
ON public.overseas_student_statistics
FOR SELECT
TO anon
USING (true);
```

The SQL Editor runs with your privileged database account, so seeing rows there does not prove that the browser's `anon` role can see them. After running the grants and policy, reload the dashboard. It should show 16 records: six destinations, six programmes, two overall gender rows, and two Chengdu gender rows.

Do not put personal student records in this publicly readable aggregate table. Never put a service-role key in the browser; it bypasses Row Level Security.

## Confirm the table rows

Run this in the SQL Editor to confirm that the records are in the expected table and schema:

```sql
SELECT id, destination, programme, gender, year_1, year_2, year_3, total
FROM public.overseas_student_statistics
ORDER BY id;
```

The Chengdu Male/Female rows should show 49 Male and 45 Female overall (Year 1: 16 Male and 14 Female). Other destinations need their own Male and Female rows to display destination-specific gender totals.

Avoid running the `INSERT` statements repeatedly: this table has no uniqueness constraint, so rerunning them creates duplicates. The dashboard detects duplicate logical rows and reports an error instead of displaying inflated counts.
