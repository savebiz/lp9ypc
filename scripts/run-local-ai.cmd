@echo off
rem LP9 YPC local AI helper: uses LM Studio on this PC instead of paid Gemini.
rem Double-click to run, or schedule it with Task Scheduler (see docs\local-ai.md).
rem Extra options are passed through, e.g.:  run-local-ai.cmd --dry-run
cd /d "%~dp0.."
call npm run ai:local -- %*
pause
