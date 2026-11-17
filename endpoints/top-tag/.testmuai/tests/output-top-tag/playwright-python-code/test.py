import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="d9442c7a-f55e-4a98-817e-09787abc0afc",
    name="Store First Top Tag",
    tc_id="TC-17",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"tag": "love"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to https://quotes.toscrape.com/', instruction_id='118dab12-2a32-444f-ad3c-302a5af3f154'):
        await page.goto("https://quotes.toscrape.com/")
    
    async with testmu.step('Reading the first tag from the Top Ten tags box'):
        set_var('tag', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {62: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(62).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=link[name="love"i] >> nth=1'], query='the first tag listed in the Top Ten tags box', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition="the first tag listed in the 'Top Ten tags' box is stored as {{tag}}"))


if __name__ == "__main__":
    testmu.run(test)