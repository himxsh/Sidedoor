import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="84169e3d-da37-4f0e-a019-fc358a4d94a9",
    name="Submit Leave Request",
    tc_id="TC-15",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"confirmation": "LR-4102"},
    global_variables=[{"id": 620306, "name": "name", "value": "Test Student", "session_value": "Test Student", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}, {"id": 620307, "name": "from", "value": "2026-11-24", "session_value": "2026-11-24", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}, {"id": 620308, "name": "to", "value": "2026-11-25", "session_value": "2026-11-25", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}, {"id": 620309, "name": "reason", "value": "Family function", "session_value": "Family function", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}],
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to http://localhost:4400/leave', instruction_id='514d519f-5a51-4df5-8899-c49772fa38c4'):
        await page.goto("http://localhost:4400/leave")
    
    async with testmu.step('Waiting for the next form step to load', instruction_id='056eac51-b458-49ad-847d-2ce9de3d46db'):
        await page.wait_for_timeout(1000)
    
    async with testmu.step('Type "{{global.name}}" into "Full name"', instruction_id='b7599343-cba0-4acf-9781-8fd7e457f693'):
        element_0 = page.locator("internal:role=textbox[name=\"Full name\"i]")
        variable_value_1 = var('{{global.name}}')
        
        await testmu.fill(element_0, variable_value_1)
    
    async with testmu.step('Type "{{global.from}}" into "From date"', instruction_id='64660340-3c14-4d7a-a161-b3ee152158e8'):
        element_2 = page.locator("internal:role=textbox[name=\"From date\"i]")
        variable_value_3 = var('{{global.from}}')
        
        await testmu.fill(element_2, variable_value_3)
    
    async with testmu.step('Waiting for the To date form to process', instruction_id='9d4f92dc-3a18-4140-a6fd-a9059b5a9940'):
        await page.wait_for_timeout(1000)
    
    async with testmu.step('Type "{{global.to}}" into "To date"', instruction_id='f31b3fb2-6ca0-4267-8c91-e49b3ad6a711'):
        element_4 = page.locator("internal:role=textbox[name=\"To date\"i]")
        variable_value_5 = var('{{global.to}}')
        
        await testmu.fill(element_4, variable_value_5)
    
    async with testmu.step('Typing reason in the request form', instruction_id='00e88e0b-b6ee-4e91-a8a8-e73526808759'):
        element_6 = page.locator("internal:role=textbox[name=\"Reason\"i]")
        variable_value_7 = var('{{global.reason}}')
        
        await testmu.fill(element_6, variable_value_7)
    
    async with testmu.step('Clicking Submit request button', instruction_id='577b572a-be93-4cd1-a4c9-38ada5bfc7e6'):
        _loc_1 = page.locator("internal:role=button[name=\"Submit request\"i]")
        
        await _loc_1.click()
    _condition_met = False
    _until_retries = 0
    while _until_retries < 10:
        print(f"[until-loop] iteration {_until_retries + 1}/10")
        async with testmu.step('Waiting for the submitted request result page to load', instruction_id='3117e350-1988-43be-b932-ec61cf5b49e9'):
            await page.wait_for_timeout(500)
        await page.wait_for_timeout(500)
        if await testmu.check_until_condition(page, 'the heading "Leave request submitted" is visible'):
            _condition_met = True
            break
        _until_retries += 1
    set_var("__result__", {"condition_met": _condition_met, "retries": _until_retries + 1})
    
    async with testmu.step('Reading the leave request confirmation number'):
        set_var('confirmation', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {10: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(10).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:text="LR-"i'], query='the confirmation number in the leave request submission message', expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition='The confirmation number shown on the result page is stored as {{confirmation}}.'))


if __name__ == "__main__":
    testmu.run(test)