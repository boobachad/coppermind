use std::io::Read;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use rdev::{grab, Event, EventType, Key};
use sqlx::postgres::PgPoolOptions;

mod pos;

/// Wrapper for PG pool stored in Tauri managed state
pub struct PosDb(pub sqlx::PgPool);

/// Double-tap threshold in milliseconds
const DOUBLE_TAP_MS: u64 = 300;

/// State for tracking shift key double-taps
struct ShiftState {
    last_left_release: Option<Instant>,
    last_right_release: Option<Instant>,
}

impl ShiftState {
    fn new() -> Self {
        Self {
            last_left_release: None,
            last_right_release: None,
        }
    }
}

/// Read the selection (Smart: Primary -> Clipboard fallback, prioritizing URLs)
#[tauri::command]
fn read_primary_selection() -> Result<String, String> {
    let (primary, clipboard) = if std::env::var("WAYLAND_DISPLAY").is_ok() {
        log::info!("Wayland: Reading both Primary and Clipboard");
        (read_wayland_primary().ok(), read_wayland_clipboard().ok())
    } else {
        log::info!("X11: Reading both Primary and Clipboard");
        (read_x11_primary().ok(), read_x11_clipboard().ok())
    };

    // Log raw contents for debugging
    log::info!("RAW Primary: {:?}", primary);
    log::info!("RAW Clipboard: {:?}", clipboard);

    // Simplified Logic: Always prefer active selection (Primary), fallback to Clipboard.
    // The Frontend determines if it's a URL or Text.

    // Priority 1: Primary has content (User selected text)
    if let Some(p) = primary {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
             log::info!("SmartCapture: Using Primary content (length: {}).", trimmed.len());
             return Ok(trimmed.to_string());
        }
    }

    // Priority 2: Clipboard has content (Fallback)
    if let Some(c) = clipboard {
        let trimmed = c.trim();
        if !trimmed.is_empty() {
             log::info!("SmartCapture: Primary empty, using Clipboard (length: {}).", trimmed.len());
             return Ok(trimmed.to_string());
        }
    }

    Err("No content found in Primary or Clipboard".to_string())
}

/// Read PRIMARY selection on Wayland using wl-clipboard-rs
fn read_wayland_primary() -> Result<String, String> {
    read_wayland_generic(wl_clipboard_rs::paste::ClipboardType::Primary)
}

/// Read REGULAR clipboard on Wayland using wl-clipboard-rs
fn read_wayland_clipboard() -> Result<String, String> {
    read_wayland_generic(wl_clipboard_rs::paste::ClipboardType::Regular)
}

fn read_wayland_generic(kind: wl_clipboard_rs::paste::ClipboardType) -> Result<String, String> {
    use wl_clipboard_rs::paste::{get_contents, MimeType, Seat};
    
    match get_contents(kind, Seat::Unspecified, MimeType::Text) {
        Ok((mut reader, _)) => {
            let mut content = String::new();
            match reader.read_to_string(&mut content) {
                Ok(_) => Ok(content.trim().to_string()),
                Err(e) => Err(e.to_string())
            }
        }
        Err(e) => Err(e.to_string())
    }
}

/// Read PRIMARY selection on X11
fn read_x11_primary() -> Result<String, String> {
    read_x11_generic(true)
}

/// Read CLIPBOARD selection on X11
fn read_x11_clipboard() -> Result<String, String> {
    read_x11_generic(false)
}

fn read_x11_generic(primary: bool) -> Result<String, String> {
    use x11_clipboard::Clipboard;
    
    let cb = Clipboard::new().map_err(|e| e.to_string())?;
    let atom = if primary { cb.getter.atoms.primary } else { cb.getter.atoms.clipboard };

    let val = cb.load(
        atom,
        cb.getter.atoms.utf8_string,
        cb.getter.atoms.property,
        Duration::from_secs(1)
    ).map_err(|e| e.to_string())?;
    
    String::from_utf8(val)
        .map(|s| s.trim().to_string())
        .map_err(|e| e.to_string())
}

/// Start the keyboard listener for double-shift detection using grab (works on Wayland)
fn start_keyboard_listener(app_handle: AppHandle) {
    let state = Arc::new(Mutex::new(ShiftState::new()));
    let double_tap_threshold = Duration::from_millis(DOUBLE_TAP_MS);
    
    thread::spawn(move || {
        let state = state.clone();
        let app = app_handle.clone();
        
        log::info!("Keyboard listener starting with grab (evdev)...");
        log::info!("Double-tap LeftShift = Question, RightShift = Answer");
        
        // Use grab() instead of listen() for Wayland support via evdev
        // Returns Some(event) to pass through, None to consume
        let result = grab(move |event: Event| -> Option<Event> {
            if let EventType::KeyRelease(key) = event.event_type {
                let now = Instant::now();
                let mut state = state.lock().unwrap();
                
                match key {
                    Key::ShiftLeft => {
                        // Check for double-tap left shift -> Question
                        if let Some(last) = state.last_left_release {
                            if now.duration_since(last) < double_tap_threshold {
                                // Double-tap detected!
                                if let Ok(content) = read_primary_selection() {
                                    if !content.is_empty() {
                                        let _ = app.emit("capture-content", serde_json::json!({
                                            "role": "question",
                                            "content": content
                                        }));
                                        log::info!("Captured question: {} chars", content.len());
                                    }
                                }
                                state.last_left_release = None;
                                return Some(event); // Pass through the event
                            }
                        }
                        state.last_left_release = Some(now);
                    }
                    Key::ShiftRight => {
                        // Check for double-tap right shift -> Answer
                        if let Some(last) = state.last_right_release {
                            if now.duration_since(last) < double_tap_threshold {
                                // Double-tap detected!
                                if let Ok(content) = read_primary_selection() {
                                    if !content.is_empty() {
                                        let _ = app.emit("capture-content", serde_json::json!({
                                            "role": "answer",
                                            "content": content
                                        }));
                                        log::info!("Captured answer: {} chars", content.len());
                                    }
                                }
                                state.last_right_release = None;
                                return Some(event); // Pass through the event
                            }
                        }
                        state.last_right_release = Some(now);
                    }
                    _ => {}
                }
            }
            
            Some(event) // Always pass through events (don't consume)
        });
        
        if let Err(e) = result {
            log::error!("Keyboard grab error: {:?}", e);
            log::error!("Make sure user is in 'input' group: sudo usermod -aG input $USER");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env from project root (coppermind/)
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_sql::Builder::default().build())?;
            app.handle().plugin(tauri_plugin_clipboard_manager::init())?;
            app.handle().plugin(tauri_plugin_shell::init())?;
            
            // Start keyboard listener for double-shift detection
            start_keyboard_listener(app.handle().clone());

            // ─── POS: Initialize PostgreSQL connection pool ───────────
            let db_url = std::env::var("POS_DATABASE_URL")
                .or_else(|_| std::env::var("VITE_DATABASE_URL"))
                .unwrap_or_else(|_| "postgres://postgres:postgres@127.0.0.1:5432/coppermind".to_string());

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match PgPoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                {
                    Ok(pool) => {
                        // Create POS tables
                        if let Err(e) = pos::db::init_pos_tables(&pool).await {
                            log::error!("[POS] Failed to init tables: {e}");
                            return;
                        }
                        // Store pool in managed state
                        handle.manage(PosDb(pool));
                        log::info!("[POS] PostgreSQL pool ready");
                    }
                    Err(e) => {
                        log::error!("[POS] Failed to connect to PostgreSQL: {e}");
                        log::error!("[POS] POS features will be unavailable");
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_primary_selection])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
