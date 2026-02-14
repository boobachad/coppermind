// ─── POS Scraper Module ─────────────────────────────────────────────
// Re-exports scraper commands from modular architecture.
// Each platform has its own module in scrapers/ directory.

// Re-export commands for Tauri (with macro attributes preserved)
pub use super::scrapers::leetcode::scrape_leetcode;
pub use super::scrapers::codeforces::scrape_codeforces;
pub use super::scrapers::github::scrape_github;

// Re-export response type for frontend
pub use super::scrapers::ScraperResponse;
