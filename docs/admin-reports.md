# Admin reports

The admin sidebar uses Reports as a collapsible label with four PDF-only submodules: `/admin/reports/sales`, `/admin/reports/quality`, `/admin/reports/demand`, and `/admin/reports/directory`. The base `/admin/reports` route redirects to sales. The selected submodule is highlighted and its group opens automatically. Mobile navigation exposes the same links in the workspace drawer. Every generation requires `requireAdmin()` on the server. Preview pagination uses 10 rows; the PDF includes all generated rows and totals. Changing a filter clears the previous report and disables export until generation completes.

## Reporting definitions

- **Vendor Sales & Commission:** Gross settled collections by financial ledger creation date, including recorded VAT and before refunds. Commission is accrued commission minus reversals, including ordinary commission adjustments after payment defaults. Cancellation fees, withholding, provider VAT and platform VAT are not added to commission. Completed bookings are completed provider requests counted by completion timestamp. Category and municipality filters use current vendor profiles. Historical payments without ledger entries cannot be reconstructed from current tax or commission rates.
- **Ratings & Complaints:** Current vendor published-rating aggregates and matching complaint records. Selecting a complaint status restricts both counts and vendors. Unrated vendors are excluded from the below-three-star filter. Complaint counts are not findings of fault.
- **Event Demand:** Distinct events scheduled in the selected Philippine calendar dates. Draft, cancelled and expired events are excluded. Share is calculated against the filtered event total. Revenue is lifetime settled collections minus completed refunds for that event cohort, as of report generation; it is not platform revenue. Payments are not limited to the scheduled event month.
- **Directories:** Current vendor or customer accounts. Statuses preserve blocked, suspended, verification and pending-deletion states rather than treating them as active. Customer booking counts exclude draft events. Vendor categories show active catalog entries.

## PDF audit information

Exports carry FEASTA branding, title, applied filters, server-authenticated administrator name, report-generation and export timestamps in Asia/Manila (Philippine Standard Time, UTC+08:00), browser-reported user agent, language, viewport and timezone, repeated table headers and page numbers. Browser metadata is descriptive and is not a verified hardware identity or authentication-session identifier. Currency columns use PHP for font compatibility. Internal record identifiers remain server-side and are not returned as report columns.

## Release and operational notes

Gabriel's VAT release `30aae563bc1ff95dcec723a349c1651174c43e70` on `chore/monorepo-setup` was inspected without merging. Its customer VAT breakdown explicitly describes an estimate and leaves the authoritative ledger server-controlled. Reports reuse the existing `normalizeLedgerRow` parser; they never derive VAT from the current vendor registration status or apply a new commission percentage.

The municipality dropdown supports the current Ormoc City scope; “All recorded municipalities” also retains historical data without implying new service coverage. Queries refuse source snapshots above 5,000 records instead of silently truncating a PDF. Larger installations need server-side batch reporting. Malformed ledger evidence stops financial report generation with a reconciliation error. No Firestore writes, migration, deployment or payment behavior changes are required.

Focused automated checks cover server authorization, validation, financial and event-date calculations, quality filters, directory fields, stale-export prevention, PDF-only navigation and multi-page PDF output. Interactive authenticated preview verification remains necessary before release.
