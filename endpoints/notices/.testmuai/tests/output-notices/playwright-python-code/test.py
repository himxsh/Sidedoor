import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="cd8713b7-577d-4464-9364-2252547f2dfa",
    name="Retrieve Latest Notice Details",
    tc_id="TC-8",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"title": "Mid-semester exam schedule released", "date": "2026-11-17"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:4400/', instruction_id='16165dd6-07d8-4d19-bd96-9324b9855b9c'):
        await page.goto("http://localhost:4400/")
    
    async with testmu.step('Extracting the title of the most recent notice'):
        set_var('title', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {18: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(18).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=cell[name="Mid-semester exam schedule"i]'], query='the title of the most recent notice in the notice board table', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='the title of the most recent notice is stored as {{title}}'))
    
    async with testmu.step('Extracting the date of the most recent notice'):
        set_var('date', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {17: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(17).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=cell[name="-11-17"i]'], query='the date of the most recent notice in the notice board table', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='the date of the most recent notice is stored as {{date}}'))


if __name__ == "__main__":
    testmu.run(test)