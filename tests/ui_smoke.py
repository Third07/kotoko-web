from pathlib import Path
from playwright.sync_api import sync_playwright

errors = []
screenshot = Path("/tmp/kotoko-mobile.png")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto("http://127.0.0.1:5173", wait_until="networkidle")

    page.get_by_role("heading", name="Isla Nights", exact=True).wait_for()
    page.get_by_role("heading", name="Tagalog Dubbed Movies").wait_for()
    assert page.locator(".mobile-nav a").count() == 5
    page.screenshot(path=str(screenshot), full_page=True)

    page.get_by_role("link", name="View Isla Nights").first.click()
    page.get_by_role("heading", name="Isla Nights", exact=True).wait_for()
    page.get_by_role("button", name="My list").click()

    page.goto("http://127.0.0.1:5173/#/library", wait_until="networkidle")
    page.get_by_role("heading", name="My library").wait_for()
    page.get_by_role("link", name="View Isla Nights").wait_for()

    page.goto("http://127.0.0.1:5173/#/detail/series/tt0000002", wait_until="networkidle")
    page.get_by_role("heading", name="Barangay Stories").wait_for()
    episode_options = page.locator("#episode-select option").all_text_contents()
    assert len(episode_options) == 2, episode_options
    assert not any("Future Episode" in option for option in episode_options)

    page.get_by_role("button", name="Play").click()
    page.locator("#player-dialog[open]").wait_for()
    page.get_by_role("button", name="Kotoko HD 1080p File").wait_for()
    page.get_by_role("link", name="Download file").wait_for()
    assert page.get_by_role("button", name="Next").is_enabled()
    page.get_by_role("button", name="Next").click()
    page.get_by_text("S1 E2 · Karaoke Night", exact=True).first.wait_for()
    page.get_by_role("button", name="Try next").click()

    page.keyboard.press("Escape")
    page.locator("#player-dialog:not([open])").wait_for()
    assert "player-open" not in (page.locator("body").get_attribute("class") or "")

    search = page.get_by_role("searchbox", name="Search Kotoko catalog")
    search.fill("Isla")
    search.press("Enter")
    page.get_by_role("heading", name='Results for “Isla”').wait_for()
    page.get_by_role("link", name="View Isla Nights").wait_for()
    page.locator(".filter-chip", has_text="Movies").click()
    page.get_by_role("heading", name='Results for “Isla”').wait_for()
    page.locator("#search-sort").select_option("title")
    page.get_by_role("heading", name='Results for “Isla”').wait_for()

    browser.close()

assert not errors, errors
print(f"UI smoke test passed; screenshot: {screenshot}")
