import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="0bd006e1-6eec-465f-ac53-cfa94c7c234c",
    name="Extract First Quote and Author",
    tc_id="TC-7",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"quote": "\u201cThe person, be it gentleman or lady, who has not pleasure in a good novel, must be intolerably stupid.\u201d", "author": "Jane Austen"},
    global_variables=[{"id": 600761, "name": "tag", "value": "humor", "session_value": "humor", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}],
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to https://quotes.toscrape.com/tag/{{global.tag}}/', instruction_id='70b83f69-97ba-4fd3-ac2a-464d797967f6'):
        variable_value_0 = var('https://quotes.toscrape.com/tag/{{global.tag}}/')
        await page.goto(variable_value_0)
    
    async with testmu.step('Reading the first quote text'):
        set_var('quote', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {7: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(7).querySelector('span.text')?.textContent ?? null);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['div >> nth=5'], query='the text of the first quote in the quote list', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='the text of the first quote is stored as {{quote}}'))
    
    async with testmu.step('Reading the first quote author'):
        set_var('author', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {7: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(7).querySelector('small.author')?.textContent ?? null);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['div >> nth=5'], query='the author of the first quote in the quote list', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='the author of the first quote is stored as {{author}}'))


if __name__ == "__main__":
    testmu.run(test)