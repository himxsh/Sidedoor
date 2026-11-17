import os
import testmu
from testmu import expect, var, set_var
from playwright.async_api import Page

testmu.configure(
    build="a7490a3e-68e0-4513-87c4-5fc3f8e3842f",
    name="Retrieve Book Price and Availability",
    tc_id="TC-13",
    network=os.getenv("NETWORK", "false").lower() == "true",
    variables={"price": "\u00a351.77", "availability": "In stock (22 available)"},
    global_variables=[{"id": 620158, "name": "title", "value": "A Light in the Attic", "session_value": "A Light in the Attic", "is_persist": False, "environment_id": 0, "environment_name": "No Env"}],
    auto_heal_version="AH2",
    default_action_timeout_ms=60000,
    default_navigation_timeout_ms=60000,
    kane_run_v4=True,
)

@testmu.test
async def test(page: Page):
    async with testmu.step('Navigate to https://books.toscrape.com/', instruction_id='b00e3f22-4b9f-436f-8dcb-9d2e1f944d3b'):
        await page.goto("https://books.toscrape.com/")
    
    async with testmu.step('PRIMARY: Click the book whose title is {{global.title}} on the home page', instruction_id='b933ca51-7a38-405d-b650-e2c81405665e'):
        _loc_1 = page.locator("internal:role=link[name=\"A Light in the Attic\"i]")
        
        await _loc_1.click(reprobe=True)
    _condition_met = False
    _until_retries = 0
    while _until_retries < 10:
        print(f"[until-loop] iteration {_until_retries + 1}/10")
        async with testmu.step('Waiting for the heading A Light in the Attic to be visible', instruction_id='b00006e0-e6c5-49ec-b8fd-3a22de7b5d97'):
            await page.wait_for_timeout(1000)
        await page.wait_for_timeout(500)
        if await testmu.check_until_condition(page, "the heading 'A Light in the Attic' is visible"):
            _condition_met = True
            break
        _until_retries += 1
    set_var("__result__", {"condition_met": _condition_met, "retries": _until_retries + 1})
    
    async with testmu.step('Reading the book price from the product details'):
        set_var('price', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {17: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(17).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=paragraph >> internal:has-text="£"i'], query="the book's price in the product details", expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition="the book's price is stored as {{price}}"))
    
    async with testmu.step('Reading the book stock availability from the product information'):
        set_var('availability', await testmu.textual_analyzer(page, wrapped_js="(els) => {\n  const __m = {44: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(44).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators=['internal:role=cell[name="In stock (22 available)"i]'], query="the book's stock availability text in the product information table", expected_value='', needs_unit_conversion=False, operator='equals', transforms=['strip'], condition="the book's stock availability text is stored as {{availability}}"))


if __name__ == "__main__":
    testmu.run(test)