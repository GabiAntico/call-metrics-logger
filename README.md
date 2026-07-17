# Call Metrics Logger

A lightweight Chrome side-panel extension for recording call-center activity without interrupting the advisor's workflow.

[Leer en español](README.es.md)

Current version: `0.3.0`  
Platform: Chrome Extension, Manifest V3

## The problem

Call-center advisors often need to count calls and technical visits manually while they are helping customers. A single call may include several different actions, such as a technical claim, an installation request, a rescheduled visit, or a transfer to another department.

Keeping those totals by hand takes attention away from the conversation, makes multi-action calls difficult to represent, and introduces avoidable counting errors.

## The solution

Call Metrics Logger stays available in the browser side panel and turns each call into a short, structured workflow. The advisor can add as many management actions as needed, review them, and submit the call only once it is complete.

The extension then:

- counts one completed call;
- calculates every technical visit generated during that call;
- separates regular visits, installations, and rescheduled visits;
- records transfer destinations without counting them as visits;
- sends the resulting aggregate to Supabase under the authenticated advisor;
- keeps the current day's counters available locally.

## Product ecosystem

Call Metrics Logger is the data-entry companion to the [Call Metrics web application](https://call-metrics.netlify.app). The web application handles user registration and presents the resulting metrics, while the extension helps advisors capture each call directly from their browser workflow.

## Main features

- Email and password authentication with automatic session refresh.
- Multiple management actions within the same call.
- Technical claims (`RT`) with online and non-online resolution paths.
- Administrative claims (`RA`), technical requests (`ST`), and suggestions (`SU`).
- Separate tracking for regular visits, installations, and rescheduled visits.
- Transfers to Commercial, Retention, or another area, limited to one per call.
- Daily counters for calls, total visits, installations, and reschedules.
- Lockable customer fields and one-click copy actions.
- A persistent advisor notepad that is independent from the active call.
- Removal of individual management actions before submission.
- Undo support for the most recently submitted call.
- Minimum-version validation through a remote `extension_config` record.

## Counting rules

One submission always adds exactly one call. Visit totals are calculated from every management action attached to that call.

| Management | Result | Total visits | Visit category |
| --- | --- | ---: | --- |
| `RT` | Online solution | 0 | None |
| `RT` | Ticket | 0 | None |
| `RT` | Observation added | 0 | None |
| `RT` | Technical visit | 1 | Regular visit |
| `ST` | With installation shipment | 1 | Installation |
| `ST` | Without installation shipment | 0 | None |
| Rescheduled VT | Saved | 1 | Rescheduled visit |
| Transfer | Commercial, Retention, or Other | 0 | None |
| `RA` / `SU` | Saved | 0 | None |

For example, a call containing two regular technical visits and one installation is stored as one call and three total visits: two regular visits and one installation.

## How it works

1. The advisor signs in with an account created in the main metrics application.
2. Optional customer details can be entered, locked, and copied when needed.
3. One or more management actions are added to the active call.
4. Selecting **Finish call** calculates the totals and inserts one aggregate record into Supabase.
5. The local daily dashboard is updated immediately.

The Supabase record includes the work date, visit totals by category, and transfer information. Customer helper fields and the advisor's draft notes are not sent to `call_records`.

## Local data and privacy

The extension uses `chrome.storage.local` to preserve:

- the authenticated Supabase session;
- counters and completed-call details grouped by advisor and local calendar date;
- the advisor's draft notes.

Local call and metric records older than 10 days are removed automatically. A new calendar date starts a separate set of daily counters. Draft notes remain available until the advisor clears them, and they are not erased when a call is completed.

Customer name, customer number, and DNI are workflow helpers. They may be present in the temporary local completed-call history, but they are not included in the Supabase payload.

## Technology

- Vanilla HTML, CSS, and JavaScript
- Chrome Extensions Manifest V3
- Chrome Side Panel and Storage APIs
- Supabase Auth
- Supabase PostgREST API with Row Level Security

No build process or third-party runtime dependency is required. All executable extension code is packaged locally.

## Install

[Install Call Metrics Logger from the Chrome Web Store](https://chromewebstore.google.com/detail/lckloimobkmdjojciamcoodbmdgenobn?utm_source=item-share-cb)

After installation, open the extension from its toolbar icon and sign in with an account created in the [Call Metrics web application](https://call-metrics.netlify.app).

## Local development

1. Clone or download this repository.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the project directory containing `manifest.json`.
6. Open the extension from its toolbar icon and sign in.

The Supabase project must already contain the expected `call_records` and `extension_config` tables, policies, and grants. User registration is intentionally handled by the main metrics application, not by this extension.

## Browser support

The current release targets Google Chrome and browsers that provide a compatible `chrome.sidePanel` API. Side-panel APIs are not standardized consistently across all browsers, so Opera GX, Firefox, and Safari are not currently guaranteed to work.

## Project structure

```text
.
|-- manifest.json       Extension metadata and permissions
|-- background.js       Side-panel activation behavior
|-- sidepanel.html      Application interface
|-- sidepanel.css       Visual design and responsive layout
`-- sidepanel.js        Authentication, form, counting, storage, and API logic
```

## Project status

Call Metrics Logger is an actively developed internal productivity tool. Version `0.3.0` adds transfer tracking and minimum-version enforcement while preserving the multi-visit counting model introduced in the previous release.
