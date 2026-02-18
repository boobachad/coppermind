// ─── Knowledge Base Utilities ──────────────────────────────────────
// Reusable functions for KB item management, URL parsing, and spaced repetition.

/**
 * Extract URLs from text using regex
 * Matches http:// and https:// URLs
 */
export function extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/(?:[a-zA-Z0-9]|[0-9]|[$-_@.&+]|[!*(),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+/g;
    const matches = text.match(urlRegex);
    return matches ? Array.from(new Set(matches)) : []; // Remove duplicates
}

/**
 * Parse WikiLinks from text
 * Matches [[link]] or [[link|display text]] format
 */
export function parseWikiLinks(text: string): Array<{ link: string; display?: string }> {
    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    const links: Array<{ link: string; display?: string }> = [];
    
    let match;
    while ((match = wikiLinkRegex.exec(text)) !== null) {
        links.push({
            link: match[1].trim(),
            display: match[2]?.trim(),
        });
    }
    
    return links;
}

/**
 * Convert WikiLinks to HTML anchor tags
 */
export function renderWikiLinks(text: string, linkHandler?: (link: string) => void): string {
    return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, link, display) => {
        const displayText = display || link;
        const onClick = linkHandler 
            ? `onclick="(${linkHandler.toString()})('${link}'); return false;"`
            : '';
        return `<a href="#" class="wiki-link" ${onClick}>${displayText}</a>`;
    });
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return '';
    }
}

/**
 * Detect URL type (Problem platform, documentation, etc.)
 */
export function detectUrlType(url: string): 'leetcode' | 'codeforces' | 'github' | 'docs' | 'other' {
    const domain = extractDomain(url);
    
    if (domain.includes('leetcode.com')) return 'leetcode';
    if (domain.includes('codeforces.com')) return 'codeforces';
    if (domain.includes('github.com')) return 'github';
    if (domain.includes('developer.mozilla.org') || 
        domain.includes('docs.') || 
        domain.endsWith('.dev')) {
        return 'docs';
    }
    
    return 'other';
}

/**
 * Extract problem ID from coding platform URLs
 */
export function extractProblemId(url: string): string | null {
    // LeetCode: https://leetcode.com/problems/two-sum/
    if (url.includes('leetcode.com/problems/')) {
        const match = url.match(/problems\/([^/]+)/);
        return match ? `leetcode-${match[1]}` : null;
    }
    
    // Codeforces: https://codeforces.com/problemset/problem/2193/H
    if (url.includes('codeforces.com/problemset/problem/')) {
        const match = url.match(/problem\/(\d+)\/([A-Z])/);
        return match ? `cf-${match[1]}${match[2]}` : null;
    }
    
    return null;
}

/**
 * Spaced Repetition Algorithm (SM-2 simplified)
 * Returns next review date based on current interval and quality
 * @param currentInterval - Current interval in days
 * @param quality - Rating 0-5 (0=total blackout, 5=perfect)
 */
export function calculateNextReview(currentInterval: number, quality: number): Date {
    const now = new Date();
    let newInterval = currentInterval;
    
    if (quality < 3) {
        // Failed: reset to 1 day
        newInterval = 1;
    } else {
        // Passed: increase interval
        if (currentInterval === 0) {
            newInterval = 1;
        } else if (currentInterval === 1) {
            newInterval = 6;
        } else {
            // SM-2 formula simplified
            const easeFactor = 1.3 + (quality - 3) * 0.15;
            newInterval = Math.round(currentInterval * easeFactor);
        }
    }
    
    // Add interval to current date
    const nextReview = new Date(now);
    nextReview.setDate(nextReview.getDate() + newInterval);
    
    return nextReview;
}

/**
 * Check if item is due for review
 */
export function isDueForReview(nextReviewDate: string | null): boolean {
    if (!nextReviewDate) return false;
    
    const reviewDate = new Date(nextReviewDate);
    const now = new Date();
    
    return reviewDate <= now;
}

/**
 * Format review date for display
 */
export function formatReviewDate(nextReviewDate: string | null): string {
    if (!nextReviewDate) return 'Not scheduled';
    
    const reviewDate = new Date(nextReviewDate);
    const now = new Date();
    const diffMs = reviewDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        return `${Math.abs(diffDays)} days overdue`;
    } else if (diffDays === 0) {
        return 'Due today';
    } else if (diffDays === 1) {
        return 'Due tomorrow';
    } else if (diffDays < 7) {
        return `Due in ${diffDays} days`;
    } else {
        return reviewDate.toLocaleDateString();
    }
}

/**
 * Deduplicate URLs against existing items
 * Returns { new: [], existing: [] }
 */
export function deduplicateUrls(
    urls: string[], 
    existingUrls: string[]
): { new: string[]; existing: string[] } {
    const existingSet = new Set(existingUrls.map(u => u.trim().toLowerCase()));
    const newUrls: string[] = [];
    const duplicates: string[] = [];
    
    for (const url of urls) {
        const normalized = url.trim().toLowerCase();
        if (existingSet.has(normalized)) {
            duplicates.push(url);
        } else {
            newUrls.push(url);
            existingSet.add(normalized);
        }
    }
    
    return { new: newUrls, existing: duplicates };
}

/**
 * Parse temporal keywords from text
 * Detects: today, tomorrow, next week, monday, tuesday, etc.
 */
export function parseTemporalKeywords(text: string): { keyword: string; date: Date } | null {
    const lowerText = text.toLowerCase();
    const now = new Date();
    
    // Today
    if (lowerText.includes('today')) {
        return { keyword: 'today', date: now };
    }
    
    // Tomorrow
    if (lowerText.includes('tomorrow')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { keyword: 'tomorrow', date: tomorrow };
    }
    
    // Next week
    if (lowerText.includes('next week')) {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return { keyword: 'next week', date: nextWeek };
    }
    
    // Specific days of week
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < daysOfWeek.length; i++) {
        if (lowerText.includes(daysOfWeek[i])) {
            const targetDay = i;
            const currentDay = now.getDay();
            let daysUntil = targetDay - currentDay;
            
            // If day has passed this week, schedule for next week
            if (daysUntil <= 0) {
                daysUntil += 7;
            }
            
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + daysUntil);
            
            return { keyword: daysOfWeek[i], date: targetDate };
        }
    }
    
    return null;
}

/**
 * Generate a short preview from content
 */
export function generatePreview(content: string, maxLength: number = 150): string {
    const cleaned = content.replace(/\[\[([^\]]+)\]\]/g, '$1') // Remove wiki links
                           .replace(/https?:\/\/[^\s]+/g, '[link]') // Replace URLs
                           .trim();
    
    if (cleaned.length <= maxLength) {
        return cleaned;
    }
    
    return cleaned.substring(0, maxLength) + '...';
}

/**
 * Score KB items for relevance to a query
 * Simple keyword matching with TF-IDF-like weighting
 */
export function scoreRelevance(itemContent: string, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = itemContent.toLowerCase();
    
    let score = 0;
    
    for (const term of queryTerms) {
        if (term.length < 2) continue; // Skip very short terms
        
        // Exact match in content
        const exactMatches = (contentLower.match(new RegExp(term, 'g')) || []).length;
        score += exactMatches * 10;
        
        // Partial match (contains term)
        if (contentLower.includes(term)) {
            score += 5;
        }
    }
    
    return score;
}
