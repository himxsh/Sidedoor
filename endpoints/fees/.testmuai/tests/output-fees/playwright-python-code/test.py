import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="768b6e4d-9ee7-4745-8aa2-34733dac22a5",
    name="Check Student Fee Details",
    tc_id="TC-14",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"amount_due": "\u20b942,500", "due_date": "2026-11-30"},
    global_variables=[{"id": 617867, "name": "student_id", "value": "S1001", "session_value": "S1001", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}],
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:4400/fees', instruction_id='603464cd-5044-4288-b611-795ad77ff61e'):
        await page.goto("http://localhost:4400/fees")
    
    async with testmu.step('Waiting for the queued steps to complete', instruction_id='1fa9bbfc-f890-4dd6-a631-38475e7b3568'):
        await page.wait_for_timeout(1000)
    
    async with testmu.step('Type "{{global.student_id}}" into "Student ID"', instruction_id='fecec92e-bca8-4f48-8e75-1938c3a93e15'):
        element_0 = page.locator("internal:role=textbox[name=\"Student ID\"i]")
        variable_value_1 = var('{{global.student_id}}')
        
        await testmu.fill(element_0, variable_value_1)
    
    async with testmu.step('Click "Check fees"', instruction_id='4ea12f3f-1b0c-433e-b67a-a99c963a92ce'):
        _loc_1 = page.locator("internal:role=button[name=\"Check fees\"i]")
        
        await _loc_1.click()
    
    async with testmu.step('Reading the amount due from the fee details'):
        set_var('amount_due', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {18: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(18).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="₹"i'], query='the amount shown next to Amount due in the fee details', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition="The amount shown next to 'Amount due' is stored as {{amount_due}}."))
    
    async with testmu.step('Reading the due date from the fee details'):
        set_var('due_date', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {19: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(19).textContent.replace(/^\\s*Due date:\\s*/, '').trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="Due date: 2026-11-"i'], query='the date shown next to Due date in the fee details', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition="The date shown next to 'Due date' is stored as {{due_date}}."))


if __name__ == "__main__":
    testmu.run(test)