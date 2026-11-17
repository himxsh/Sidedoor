---
mode: testing
max_steps: 50
timeout: 240
target: chrome
headless: true
---

# Session: fees

## Step 1
Go to http://localhost:4400/fees. Type {{student_id}} into the Student ID field and click Check fees. Store the amount shown next to 'Amount due' as 'amount_due' and the date shown next to 'Due date' as 'due_date'.
