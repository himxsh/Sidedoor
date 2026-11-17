import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="ff7882da-b6f6-462f-973c-eb3f75913154",
    name="Extract and Verify Quote and Author",
    tc_id="TC-4",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"author_name_visible": "true", "quote": "\u201cYou believe lies so you eventually learn to trust no one but yourself.\u201d", "author": "Marilyn Monroe"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to https://quotes.toscrape.com/random', instruction_id='eab19b80-b34f-4a6c-ae26-767c710d10ac'):
        await page.goto("https://quotes.toscrape.com/random")
    
    async with testmu.step('Checking whether an author name is present'):
        set_var('author_name_visible', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {5: 0};\n  const el = (i) => els[__m[i]];\n  const __v = ((() => { const a=el(5).querySelector('.author'); return !!a && a.textContent.trim().length > 0 && getComputedStyle(a).display !== 'none' && getComputedStyle(a).visibility !== 'hidden'; })());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['div >> nth=5'], query='whether an author name is present (in the displayed quote card)', expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition='An author name is visible on the page.'))
    
    async with testmu.step('Extracting the displayed quote text'):
        set_var('quote', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {5: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(5).querySelector('.text')?.textContent.trim() ?? null);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['div >> nth=5'], query='the quote text in the displayed quote card', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='The quote text is stored as {{quote}}.'))
    
    async with testmu.step('Extracting the displayed author name'):
        set_var('author', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {5: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(5).querySelector('.author')?.textContent.trim() ?? null);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['div >> nth=5'], query='the author name in the displayed quote card', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='The author name is stored as {{author}}.'))
    
    async with testmu.step('Assertion check', instruction_id='709c48a9-4d1f-443b-8d32-04a17acc19e9'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': 'An author name is visible on the page.', 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{author_name_visible}}', 'store_key': 'author_name_visible', 'variable_refs': {'{{author_name_visible}}': 'true'}}], 'sub_checks': [{'description': 'An author name is visible on the page.', 'store_key': 'author_name_visible', 'expected_value': 'true', 'extracted_value': '{{author_name_visible}}', 'operator': 'equals', 'transforms': []}], 'composite_operator': 'and', 'claim': 'An author name is visible on the page.'})


if __name__ == "__main__":
    testmu.run(test)