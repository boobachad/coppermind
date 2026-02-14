use std::env;

/// POS configuration loaded from environment variables
#[derive(Debug, Clone)]
pub struct PosConfig {
    /// PostgreSQL connection URL
    pub database_url: String,
    /// LeetCode username for scraping
    pub leetcode_username: Option<String>,
    /// Codeforces handle for scraping
    pub codeforces_handle: Option<String>,
    /// GitHub username for scraping
    pub github_username: Option<String>,
    /// GitHub personal access token for API access
    pub github_token: Option<String>,
    /// Shadow activity duration in minutes (default: 30)
    pub shadow_activity_minutes: i64,
    /// Database connection timeout in seconds (default: 10)
    pub db_connection_timeout_secs: u64,
    /// Database max connections (default: 5)
    pub db_max_connections: u32,
}

impl PosConfig {
    /// Load configuration from environment variables with validation
    pub fn from_env() -> Result<Self, String> {
        // Database URL (required, with fallback)
        let database_url = env::var("POS_DATABASE_URL")
            .or_else(|_| env::var("VITE_DATABASE_URL"))
            .unwrap_or_else(|_| {
                log::warn!("[POS Config] No DATABASE_URL found, using default");
                "postgres://postgres:postgres@127.0.0.1:5432/coppermind".to_string()
            });

        // Validate database URL format
        if !database_url.starts_with("postgres://") && !database_url.starts_with("postgresql://") {
            return Err(format!("Invalid database URL format: {}", database_url));
        }

        // LeetCode username (optional)
        let leetcode_username = env::var("LEETCODE_USERNAME").ok();
        if leetcode_username.is_none() {
            log::warn!("[POS Config] LEETCODE_USERNAME not set - LeetCode scraper will be unavailable");
        }

        // Codeforces handle (optional)
        let codeforces_handle = env::var("CODEFORCES_HANDLE").ok();
        if codeforces_handle.is_none() {
            log::warn!("[POS Config] CODEFORCES_HANDLE not set - Codeforces scraper will be unavailable");
        }

        // GitHub username (optional)
        let github_username = env::var("GITHUB_USERNAME").ok();
        if github_username.is_none() {
            log::warn!("[POS Config] GITHUB_USERNAME not set - GitHub scraper will be unavailable");
        }

        // GitHub token (optional)
        let github_token = env::var("GITHUB_TOKEN").ok();
        if github_token.is_none() {
            log::warn!("[POS Config] GITHUB_TOKEN not set - GitHub API access will be limited");
        }

        // Validate GitHub config consistency
        if github_username.is_some() && github_token.is_none() {
            log::warn!("[POS Config] GITHUB_USERNAME set but GITHUB_TOKEN missing - API rate limits will apply");
        }
        if github_token.is_some() && github_username.is_none() {
            log::warn!("[POS Config] GITHUB_TOKEN set but GITHUB_USERNAME missing - scraper will be unavailable");
        }

        // Shadow activity duration (optional, default 30)
        let shadow_activity_minutes = env::var("SHADOW_ACTIVITY_MINUTES")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(30);

        if shadow_activity_minutes < 1 || shadow_activity_minutes > 480 {
            return Err(format!(
                "SHADOW_ACTIVITY_MINUTES must be between 1 and 480, got: {}",
                shadow_activity_minutes
            ));
        }

        // Database connection timeout (optional, default 10 seconds)
        let db_connection_timeout_secs = env::var("POS_DB_TIMEOUT_SECS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(10);

        if db_connection_timeout_secs < 1 || db_connection_timeout_secs > 60 {
            return Err(format!(
                "POS_DB_TIMEOUT_SECS must be between 1 and 60, got: {}",
                db_connection_timeout_secs
            ));
        }

        // Database max connections (optional, default 5)
        let db_max_connections = env::var("POS_DB_MAX_CONNECTIONS")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(5);

        if db_max_connections < 1 || db_max_connections > 100 {
            return Err(format!(
                "POS_DB_MAX_CONNECTIONS must be between 1 and 100, got: {}",
                db_max_connections
            ));
        }

        Ok(Self {
            database_url,
            leetcode_username,
            codeforces_handle,
            github_username,
            github_token,
            shadow_activity_minutes,
            db_connection_timeout_secs,
            db_max_connections,
        })
    }

    /// Get LeetCode username or return error
    pub fn require_leetcode_username(&self) -> Result<&str, String> {
        self.leetcode_username
            .as_deref()
            .ok_or_else(|| "LEETCODE_USERNAME not configured".to_string())
    }

    /// Get Codeforces handle or return error
    pub fn require_codeforces_handle(&self) -> Result<&str, String> {
        self.codeforces_handle
            .as_deref()
            .ok_or_else(|| "CODEFORCES_HANDLE not configured".to_string())
    }

    /// Get GitHub username or return error
    pub fn require_github_username(&self) -> Result<&str, String> {
        self.github_username
            .as_deref()
            .ok_or_else(|| "GITHUB_USERNAME not configured".to_string())
    }

    /// Get GitHub token or return error
    pub fn require_github_token(&self) -> Result<&str, String> {
        self.github_token
            .as_deref()
            .ok_or_else(|| "GITHUB_TOKEN not configured".to_string())
    }

    /// Check if GitHub is fully configured (both username and token)
    pub fn has_github_config(&self) -> bool {
        self.github_username.is_some() && self.github_token.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shadow_duration_validation() {
        env::set_var("SHADOW_ACTIVITY_MINUTES", "0");
        assert!(PosConfig::from_env().is_err());

        env::set_var("SHADOW_ACTIVITY_MINUTES", "481");
        assert!(PosConfig::from_env().is_err());

        env::set_var("SHADOW_ACTIVITY_MINUTES", "30");
        assert!(PosConfig::from_env().is_ok());
    }
}

// ─── Tauri Commands ─────────────────────────────────────────────────

use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PosConfigResponse {
    pub leetcode_username: Option<String>,
    pub codeforces_handle: Option<String>,
    pub github_username: Option<String>,
    pub has_github_token: bool,
}

/// Get POS configuration (without exposing sensitive tokens)
#[tauri::command]
pub fn get_pos_config(config: State<'_, crate::PosConfig>) -> PosConfigResponse {
    PosConfigResponse {
        leetcode_username: config.0.leetcode_username.clone(),
        codeforces_handle: config.0.codeforces_handle.clone(),
        github_username: config.0.github_username.clone(),
        has_github_token: config.0.github_token.is_some(),
    }
}
