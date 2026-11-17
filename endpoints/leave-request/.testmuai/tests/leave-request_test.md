---
mode: testing
max_steps: 50
timeout: 240
target: chrome
headless: true
---

# Session: leave-request

## Step 1
Go to http://localhost:4400/leave. Type {{name}} into the Full name field, enter {{from}} in the From date field and {{to}} in the To date field, type {{reason}} into the Reason field, then click Submit request. Store the confirmation number shown on the result page as 'confirmation'.
