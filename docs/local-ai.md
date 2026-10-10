# Local AI helper (LM Studio)

The live site runs on Vercel and uses Google Gemini. Vercel can't reach LM Studio on your PC, so a small **local helper** runs on your Windows PC instead. It uses your LM Studio models (free) for two jobs:

1. **Job sources that need AI.** These are pages with no structured job data, such as MyJobMag and Jobberman listing pages. Jobs it finds go into **Admin → Review queue** as usual. Nothing is published without your approval.
2. **Career suggestions.** It maps each member profession to career paths using the model's own knowledge. There is **no web search**, so these results have no sources, and the site labels them as offline suggestions.

Feeds and pages with structured job data don't need AI. The Vercel daily cron already reads them.

## One-time setup

1. In LM Studio, load **Gemma 4 E4B** (`lmstudio-community/gemma-4-E4B-it-GGUF`) and **unload Qwen3.8 27B**. This laptop has no graphics card for AI, so the model runs on the processor: Gemma answers a short request in about 30 seconds, while Qwen 27B took over 10 minutes (tested 2026-10-10). Keep only one model loaded so it has the memory to itself.
2. Open the **Developer** tab and click **Start Server**. The default address is `http://localhost:1234`.
3. `.env.local` already has the Supabase keys the helper needs. You can also add:
   - `LMSTUDIO_MODEL=` the model id exactly as LM Studio shows it. If this is blank, the helper picks Gemma 4 E4B, then Qwen3.8 27B, or else the first model listed.
   - `LMSTUDIO_BASE_URL=` leave blank for `http://localhost:1234/v1`. Only addresses on this PC (`localhost`, `127.0.0.1`, `[::1]`) are accepted, so data is never sent anywhere else.

## Running it

- Double-click `scripts\run-local-ai.cmd`. The window stays open so you can read the summary.
- Or, in a terminal, first go to the website folder (not the planning folder):
  `cd "C:\Users\hp\OneDrive - Dataguard Document Management Limited\Desktop\GIGS\LP9-YPC"`
  then run `npm.cmd run ai:local`. In Windows PowerShell type `npm.cmd`, not `npm`: plain `npm` is blocked
  there ("running scripts is disabled on this system"), and `npm.cmd` avoids that without changing any Windows setting.
- Useful options: `--dry-run` (save nothing), `--research-only`, `--jobs-only`, `--retry-failed`
  (retry professions that failed instead of waiting 24 hours).
- Options:
  - `--jobs-only`: job sources only.
  - `--research-only`: career suggestions only.
  - `--dry-run`: reads pages and asks the model, but saves nothing.

If LM Studio isn't running, the helper says so. Expect a few minutes per career profession and 10-20 minutes per AI job page on this laptop; schedule it overnight and leave the PC plugged in.

Each run adds a line to the agent log (`agent_runs`, trigger "local").

## Run it daily with Task Scheduler (optional)

1. Open **Task Scheduler**, then choose **Create Basic Task…**.
2. Name: `LP9 YPC local AI`. Trigger: **Daily**, at a time your PC is usually on, for example 7:00.
3. Action: **Start a program**. Program: the full path to `scripts\run-local-ai.cmd` in the project folder. In **Start in**, enter the project folder.
4. Finish. To stop the window waiting for a key press, use `cmd /c "cd /d <project folder> && npm run ai:local"` as the program instead.
5. LM Studio must be open with the server started at that time. You can set LM Studio to start the server automatically in its settings.
