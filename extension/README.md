# LatentFill

LatentFill is a Chrome extension that fills out job applications from your resume using an AI model you choose. It runs on your own API key, so there's no daily limit.

## Install (about 1 minute)
1. Unzip this folder.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Remove any older LatentFill, then click **Load unpacked** and pick the `latentfill-v1.3` folder.
4. Pin LatentFill to your toolbar. Settings open from the popup.

## Setup
1. **AI provider:** pick OpenAI, Anthropic, Gemini, or any OpenAI-compatible server, then paste your API key and click **Test connection**.
   - Gemini has a free tier, which is the cheapest way to start.
   - For local models (Ollama), set Base URL to `http://localhost:11434/v1`, and start Ollama with `OLLAMA_ORIGINS=chrome-extension://*` so the extension is allowed to connect to it.
2. **Resume:** upload your PDF. It gets attached to resume upload fields automatically. Click **Parse resume with AI** to fill in your profile.
3. **Standard answers:** work authorization, sponsorship, salary, EEO, and so on. The AI only uses what you enter here. Anything left blank gets flagged for you to fill in.

## Use
Open an application page, then click **Autofill this page** or press `Alt+Shift+F`.
- Fields outlined in green were filled. Fields outlined in amber need you to look at them.
- Consent and terms checkboxes, passwords, SSNs, and dates of birth are always left for you.
- Multi-page forms: after the first page, it keeps filling each new page or step on its own (same site, for 45 minutes). The results box shows a **Stop** link, and you can turn this off in Settings.
- Education and work history: it clicks "Add another" / "+ Add" and opens collapsed sections until there is one entry per school and job on your resume, then fills each entry from the matching resume item, including its dates. Click **Parse resume with AI** in Settings first so it knows your schools, jobs and dates.
- Always review before you submit.

## What's new in 1.3
- Fills the next page of an application automatically, so you don't have to press Fill again.
- Adds and opens education / job-history entries, and confirms inline editors (Workable's "Update").
- Searches long school lists, e.g. types "University of Virginia" and picks it.
- Uses each resume entry's own start and end dates.
- Supports more dropdown styles: click-to-open menus (Rippling, BambooHR), Yes/No button groups (Ashby, Workable), searchable selects, and masked date fields.
- Better resume / cover letter upload detection, and it skips CAPTCHA frames.
- Tested on Greenhouse (Discord, Figma, Stack AV, Airbnb embed), Lever (Palantir, Spotify, Lever demo), Ashby (Ramp, OpenAI), Workable, Rippling and BambooHR.

## Running memory
LatentFill keeps learning as you use it:
- **Teach it directly:** type a fact into the popup's "Teach LatentFill" box, e.g. "I started at UVA in August 2023." Facts override your resume.
- **It learns from your corrections:** when you change an answer it filled, or fill in one it left blank, it saves your version.
- **It learns when you submit:** when you click Submit, Next, or Continue, it saves your final short answers. It doesn't save essays the AI wrote unless you edited them.
- **Next time:** on later forms, it sends the AI the saved facts and answers that match the questions, even when the wording is different, and the AI reuses them.
- **Manage it:** Settings → Memory lets you search, forget, export, import, or clear what it's learned. It never saves passwords, SSNs, dates of birth, or consent checkboxes.

## How it works
- `content.js` runs in every frame of the page, including embedded Greenhouse/Lever iframes. It finds the fields and works out each one's label from `<label>`, aria attributes, legends, and nearby text. It also opens dropdown-style inputs (comboboxes) to read their options.
- `background.js` sends the whole form to the AI in a single call, along with your profile, resume text, notes, and the job description. The AI replies with `{ fieldId: value }`.
- `content.js` then fills each field in a way React and Angular forms pick up (native value setter plus input and change events). It picks options by fuzzy-matching their text, types into autocompletes and clicks the right suggestion, and attaches your resume file.
- `llm.js` contains the provider adapters. Your data is stored in `chrome.storage.local` and goes only to the provider you chose.

## Files
manifest.json · background.js · content.js · llm.js · popup.html/js · options.html/js · styles.css · icons/

## Version 1.1 updates
- Gemini default is gemini-3.5-flash-lite. An explicitly saved model is preserved; keep your working model selected.
- AI requests stop after 45 seconds and display timeout/provider errors instead of spinning indefinitely.
- Pasting valid profile JSON synchronizes the standard-answer controls, preventing stale controls from overwriting pasted values.
- Citizenship and drug-free workplace answers have dedicated controls. Agreement/consent checkboxes still require manual review.
- Resume parsing includes minors, projects, and technical training, and retains existing custom profile fields and standard answers.

## Version 1.2.1 updates

- Results now also appear in a banner on the page (bottom-right) with the version number, since the popup can close while Chrome shows the debugging bar.
- Flagged dropdowns now say why, e.g. "the menu didn't open", "no option matched (saw: ...)", or "real keystrokes unavailable".
- After filling, every dropdown is checked again, and any the form reset is filled again or flagged.
- Always loads the newest code into a tab, even one that was open during an update.

## Version 1.2 updates

- Fixed custom dropdowns (Greenhouse/react-select, e.g. Stack AV). These ignore scripted events, so before 1.2 the answer was only typed into the box and the site still said "This field is required." LatentFill now opens the menu, waits for options to load (including menus rendered elsewhere on the page and searchable/async lists), picks the real option with genuine keystrokes, and confirms the selection is still there after the field loses focus.
- If a selection can't be confirmed, the typed text is cleared and the field appears in the popup as `Pick "X" manually` instead of being counted as filled.
- Precise dropdown mode uses Chrome's `debugger` permission. While filling, Chrome shows a yellow "LatentFill started debugging this browser" bar for a few seconds; that's expected. Close DevTools on the tab or precise mode can't attach. You can turn it off in Settings, but custom dropdowns will then be flagged for manual review.
- Automatic cover letters: when a form has a cover-letter upload or text box, LatentFill writes a letter tailored to the job in your template's format and attaches it as a PDF (Helvetica 11pt, 1" margins), or pastes it into the text box. Toggle with "Write cover letters automatically during autofill" in Settings.
- Fixed `generateCoverLetter` reading the job description from a Promise.

## Cover letters
1. Open the full job posting/application in another tab in this Chrome window.
2. In Settings, find Cover letter. Your supplied format is included as editable text. This preserves its content/structure, not its original PDF typography.
3. Click Generate from job tab and confirm the identified page. The most recently accessed web tab is selected.
4. Review and edit the draft. Click Save settings to make it available for autofill. Download PDF is also available.
5. Return to the SAME application URL and run autofill. Recognized cover-letter uploads receive a generated PDF; text fields use the reviewed draft. Review every filled field and attachment before submitting.
6. Generate a new letter for a different application or URL. A letter is never automatically reused on another URL.

The PDF uses a standard font and supports Latin text with normalized punctuation. Unsupported characters produce an explicit error; edit those characters or paste the text manually. Unknown recipient details should be omitted. Check all AI-generated facts.

## Updating an installed copy
Keep the same extension entry and installation folder to retain its browser-local settings. Back up your existing folder, then replace its source files with this version. Click Reload on its chrome://extensions card and refresh application/settings tabs. Do not remove the extension, since that clears its settings. No API keys or user profile are bundled here.

## Verification
JavaScript syntax checked. Mocked checks cover timeout/503 handling and preservation of custom profile fields. PDF rendered locally and inspected. Live Gemini calls and third-party application uploads were not tested; some sites block scripted uploads or need manual attachment.
