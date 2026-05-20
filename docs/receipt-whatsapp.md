# Receipt PDF and WhatsApp Sharing

## PDF receipts

Each fee installment has a `receiptNo`. From the student details installment table, staff and owners can download a PDF receipt for any installment.

The receipt is generated in the app using `@react-pdf/renderer` and includes:

- Receipt number, payment date, and generated date
- Student details
- Branch details
- Amount paid and notes
- Total fee, total paid, and balance

Receipt access is checked in `receiptService`. Staff can generate receipts only for students in their assigned branch. Owners can generate receipts for all branches.

## WhatsApp sharing

The app uses a zero-cost WhatsApp click-to-chat link:

```text
https://wa.me/{phone}?text={encodedMessage}
```

The message is prefilled with receipt details, including receipt number, branch, course, payment date, paid amount, total fee, total paid, and balance.

Indian phone numbers are normalized before opening WhatsApp:

- 10 digits are prefixed with `91`
- 12 digits starting with `91` are accepted
- Other formats are rejected

## Limitation

The `wa.me` link cannot automatically attach the generated PDF receipt. The user can download the PDF and manually attach it in WhatsApp if needed.

## Future upgrade

WhatsApp Business API can send document attachments automatically, but it may require paid setup, approval, templates, and API integration.
