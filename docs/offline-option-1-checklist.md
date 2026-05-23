# Offline Option 1 Checklist

Use this checklist after changes that touch Firebase reads, writes, payments, receipts, or dashboard/report calculations.

## Cache And Connectivity

- Open the app online and visit Dashboard, Students, Attendance, Expenses, Payments, and Reports once.
- Turn off internet.
- Confirm the header badge changes to `Offline`.
- Confirm the global notice says cached data is being shown.
- Reopen the app while offline and confirm previously visited screens still show cached data where available.

## Listener-Driven Screens

- Students: add or edit a student online and confirm the list updates without manual refresh.
- Attendance: mark a session online and confirm the completed count updates without manual refresh.
- Expenses: add, edit, and delete an expense online and confirm the table/summary update without manual refresh.
- Dashboard: change a student, payment, attendance extension, or expense and confirm dashboard cards/tables update.
- Reports: change branch filters while online and offline; cached reports should render when data has been cached.

## Offline Writes

- While offline, add or edit a student.
- Confirm a pending/syncing badge or cached notice appears.
- Reconnect internet and confirm the status returns to online/synced.
- While offline, add an expense.
- Reconnect internet and confirm the expense appears in Firebase and dashboard totals.
- While offline, mark attendance.
- Reconnect internet and confirm the session update syncs.

## Payment And Receipt Sync

- Turn off internet.
- Open Payments and confirm a payment can be saved as a pending receipt.
- Try Add Installment from Student Details and confirm it saves as a pending receipt.
- Confirm pending receipts reduce the visible balance locally.
- Confirm pending receipts do not show PDF, share, or WhatsApp receipt actions.
- Try editing/deleting a payment while offline and confirm it is blocked.
- Try a paid course extension while offline and confirm it is blocked or shows a clear sync error.
- Try a free course extension while offline and confirm it can be saved and later synced.
- Reconnect internet and confirm the pending payment syncs, receives an official receipt number, and then PDF, share, and WhatsApp actions work.

## Reports And Exports

- Generate each report after data has been cached.
- Turn off internet and revisit reports.
- Confirm cached report data still appears.
- Export CSV from cached report data.
- Reconnect and confirm reports refresh with the latest synced data.

## Known Limitations

- Receipt numbers remain online-generated because they require strong sequencing; offline payments use pending local records until sync.
- Firestore offline cache can only show data that the app has already loaded or that Firestore has cached.
- Complex conflict resolution is not included in Option 1; this remains a future local-first database/sync-queue concern.
