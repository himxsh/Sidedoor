---
mode: testing
max_steps: 50
timeout: 240
target: chrome
headless: true
---

# Session: book-price

## Step 1
Go to https://books.toscrape.com/. Click the book whose title is {{title}} on the home page, then store its price as 'price' and its stock availability text as 'availability'.
