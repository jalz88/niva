# Product Philosophy

## North star

> Every feature must reduce operational effort without increasing operational complexity.

NIVA succeeds when the owner spends less time managing records and more time running a welcoming property.

## 1. Lightweight by design

Lightweight means more than a small download. It means few concepts, short forms, clear words, restrained dependencies, fast paths, and no need for specialist training. A feature that adds settings, setup, or exceptions must provide a clear return.

## 2. Build for expansion without building everything now

NIVA models durable business concepts—properties, transactions, platforms, categories, currencies, users—rather than hard-coding today’s labels. This lets a future Bali property or Booking.com platform be added as data. It does **not** justify building unused booking, inventory, or maintenance screens now.

## 3. One transaction model

Income and expense are two types of a transaction. This produces consistent audit fields, filtering, reporting, and future exports. The form should adapt its labels and optional fields to the chosen type, so users only see relevant inputs.

## 4. Configuration belongs to the business

If an owner might reasonably want to rename, enable, disable, reorder, or add a value, it belongs in the database and management UI. This includes properties, platforms, categories, payment methods, and currencies.

The interface should prevent damaging configuration changes: an item already used by a transaction is disabled/archived rather than silently removed.

## 5. Financial clarity, not accounting theatre

NIVA uses familiar language—income, expense, net result, platform, payment method. It avoids journals, ledgers, debits, credits, and tax terminology unless the product later has a justified accounting integration. Precision still matters: amounts, dates, permissions, and edit history must be dependable.

## 6. Make state visible

Users should never guess whether an action worked. NIVA must clearly show:

- what is saving and when it has saved;
- what changed after an edit;
- what a deletion will remove and whether it can be undone;
- why an action is blocked;
- what happens next after login, filters, or an empty result.

Detailed interaction rules live in the UI/UX principles document.

## 7. Progressive disclosure

The default screen shows only what a user needs to make the next decision. Advanced filters, configuration, and historical detail are available but never compete with Quick Add or the current-month picture.

## 8. Trust is a feature

Trust comes from consistent totals, understandable dates and currencies, clear confirmation, safe error recovery, secure access, and an honest scope. NIVA must not imply that it has saved something when a network request failed.

## 9. Design for real conditions

The app must work well on small screens, touch input, and unreliable mobile data. It may cache the app shell for quick reopening, but financial data remains server-backed in Release 1. If a connection is unavailable, tell the user plainly and do not pretend to queue financial changes.

## 10. Calm visual character

NIVA should feel warm, precise, and modern—closer to a well-designed personal finance or property tool than dense enterprise accounting software. Use whitespace, a restrained palette, readable typography, and purposeful hierarchy. Motion and decoration never delay or obscure a financial task.

## 11. Product decision checklist

For every proposal, document answers to:

1. Which user problem does it solve?
2. What is the simplest useful version?
3. Which core object owns the data?
4. Which permissions, validation, feedback, and recovery paths are required?
5. What does it cost in loading time, maintenance, and cognitive effort?
6. Why is now the right time to build it?
