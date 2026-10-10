# Local AI helper (LM Studio)

The live site runs on Vercel and uses Google Gemini. Vercel can't reach LM Studio on your PC, so a small **local helper** runs on your Windows PC instead. It uses your LM Studio models (free) for two jobs:

1. **Job sources that need AI.** These are pages with no structured job data, such as MyJobMag and Jobberman listing pages. Jobs it finds go into **Admin → Review queue** as usual. Nothing is published without your approval.
2. **Career suggestions.** It maps each member profession to career paths using the model's own knowledge. There is **no web search**, so these results have no sources, and the site labels them as offline suggestions.

Feeds and pages with structured job data don't need AI. The Vercel daily cron already reads them.

## One-time setup

1. In LM Studio, download and load **Qwen3.8 27B** (`lmstudio-community/Qwen3.8-27B-GGUF`, Q4_K_M). It is the best of your models at structured extraction. Gemma 4 E4B is faster but less accurate.
2. Open the **Developer** tab and click **Start Server**. The default address is `http://localhost:1234`.
3. `.env.local` already has the Supabase keys the helper needs. You can also add:
   - `LMSTUDIO_MODEL=` the model id exactly as LM Studio shows it. If this is blank, the helper picks the loaded Qwen3.8 27B model, or else the first loaded model.
   - `LMSTUDIO_BASE_URL=` leave blank for `http://localhost:1234/v1`. Only addresses on this PC (`localhost`, `127.0.0.1`, `[::1]`) are accepted, so data is never sent anywhere else.

## Running it

- Double-click `scripts\run-local-ai.cmd`. The window stays open so you can read the summary.
- Or, in a terminal in the project folder, run `npm run ai:local`.
- Options:
  - `--jobs-only`: job sources only.
  - `--research-only`: career suggestions only.
  - `--dry-run`: reads pages and asks the model, but saves nothing.

If LM Studio isn't running, the helper says: "Start LM Studio, load Qwen3.8 27B and turn on the local server". A 27B model is slow, so a full run can take several minutes.

Each run adds a line to the agent log (`agent_runs`, trigger "local").

## Run it daily with Task Scheduler (optional)

1. Open **Task Scheduler**, then choose **Create Basic Task…**.
2. Name: `LP9 YPC local AI`. Trigger: **Daily**, at a time your PC is usually on, for example 7:00.
3. Action: **Start a program**. Program: the full path to `scripts\run-local-ai.cmd` in the project folder. In **Start in**, enter the project folder.
4. Finish. To stop the window waiting for a key press, use `cmd /c "cd /d <project folder> && npm run ai:local"` as the program instead.
5. LM Studio must be open with the server started at that time. You can set LM Studio to start the server automatically in its settings.
