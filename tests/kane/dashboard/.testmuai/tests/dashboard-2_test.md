---
mode: testing
max_steps: 50
timeout: 240
target: chrome
headless: true
---

# Session: dashboard

## Step 1
Go to http://localhost:3030/. Scroll down the Endpoints list until the card whose name is 'quotes' is visible. Verify that the status badge next to the name 'quotes' contains the text 'healthy'. Verify that the 'Calls served' total shows a number.
