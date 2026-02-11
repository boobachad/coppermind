use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

/// cuid-style unique ID. Sufficient for a single-user Tauri desktop app.
/// Format: `c<millis_timestamp><8_hex_random>`
pub fn gen_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("c{}{:08x}", ts, rand_u32())
}

/// Lightweight random u32 using RandomState hasher seed.
/// Not cryptographic, but sufficient for ID uniqueness in single-user context.
fn rand_u32() -> u32 {
    let s = RandomState::new();
    let mut h = s.build_hasher();
    h.write_u8(0);
    h.finish() as u32
}
