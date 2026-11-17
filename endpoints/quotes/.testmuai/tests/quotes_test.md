---
mode: testing
max_steps: 50
timeout: 240
target: chrome
headless: true
---

# Session: quotes

## Step 1
Go to https://quotes.toscrape.com/tag/{{tag}}/. Store the text of the first quote as 'quote' and store its author as 'author'.
