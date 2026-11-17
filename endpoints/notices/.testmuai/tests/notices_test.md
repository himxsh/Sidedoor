---
mode: testing
max_steps: 50
timeout: 240
target: chrome
headless: true
---

# Session: notices

## Step 1
Go to http://localhost:4400/. Open Announcements first, then identify the newest notice and save both its title and date. Add a check that a notice record is visible before setting either variable. Store the title of the most recent notice as 'title' and store its date as 'date'.
