import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="e8b01262-2c91-4c8f-9710-9dcfc0b864a2",
    name="Verify Notice Board Entry",
    tc_id="TC-9",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"notice_title_listed_check": "true", "notice_date_check": "2026-11-17"},
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:4400/notices?layout=a', instruction_id='7f38de8c-1f8e-459e-a6db-dbee15fd6cc3'):
        await page.goto("http://localhost:4400/notices?layout=a")
    
    async with testmu.step('Checking whether the requested notice is listed on the notice board'):
        set_var('notice_title_listed_check', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {18: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(18).textContent.trim() === 'Mid-semester exam schedule released');\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=cell[name="Mid-semester exam schedule"i]'], query="whether a notice titled 'Mid-semester exam schedule released' on the notice board is present (in the notice board table)", expected_value='true', needs_unit_conversion=False, operator='equals', transforms=[], condition="the notice board lists a notice titled 'Mid-semester exam schedule released'"))
    
    async with testmu.step('Reading the notice publication date'):
        set_var('notice_date_check', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {17: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(17).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=cell[name="-11-17"i]'], query='the publication date for the Mid-semester exam schedule released notice in the notice board table', expected_value='2026-11-17', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='the notice is dated 2026-11-17'))
    
    async with testmu.step('Assertion check', instruction_id='ae9b2636-c235-4add-875e-5baf36fcefdb'):
        await testmu.verify_assertion(page, 'Assertion check', {'operator': ['equals'], 'assertion_operands': [], 'left_operand': None, 'right_operand': None, 'operands': [], 'sub_results': [{'description': "the notice board lists a notice titled 'Mid-semester exam schedule released'", 'passed': True, 'operator': 'equals', 'transforms': [], 'json_path': None, 'expected': 'true', 'extracted_value': '{{notice_title_listed_check}}', 'store_key': 'notice_title_listed_check', 'variable_refs': {'{{notice_title_listed_check}}': 'true'}}, {'description': 'the notice is dated 2026-11-17', 'passed': True, 'operator': 'equals', 'transforms': ['strip'], 'json_path': None, 'expected': '2026-11-17', 'extracted_value': '{{notice_date_check}}', 'store_key': 'notice_date_check', 'variable_refs': {'{{notice_date_check}}': '2026-11-17'}}], 'sub_checks': [{'description': "the notice board lists a notice titled 'Mid-semester exam schedule released'", 'store_key': 'notice_title_listed_check', 'expected_value': 'true', 'extracted_value': '{{notice_title_listed_check}}', 'operator': 'equals', 'transforms': []}, {'description': 'the notice is dated 2026-11-17', 'store_key': 'notice_date_check', 'expected_value': '2026-11-17', 'extracted_value': '{{notice_date_check}}', 'operator': 'equals', 'transforms': ['strip']}], 'composite_operator': 'and', 'claim': "the notice board lists a notice titled 'Mid-semester exam schedule released' dated 2026-11-17"})


if __name__ == "__main__":
    testmu.run(test)